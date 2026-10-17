// ---------------------------------------------------------------------------
// Rota até o animal: lógica da "pista quente"
// ---------------------------------------------------------------------------
// Regras:
//  1. Só lugares PÚBLICOS viram destino:
//     - o ponto de um animal encontrado solto na rua que ninguém levou;
//     - avistamentos em que a pessoa informou que o animal estava na rua.
//     O local onde o animal sumiu (costuma ser a casa do tutor), animais
//     acolhidos em casa e animais para adoção NUNCA têm rota.
//  2. Entre os pontos públicos, vale o MAIS RECENTE.
//  3. A pista perde valor com o tempo: até 6 h é "quente", até 48 h é "morna"
//     e depois disso fica "fria" (sem rota; um novo avistamento reativa).
//  4. O destino é uma ÁREA de ~150 m, não o ponto marcado: o centro da área é
//     deslocado de forma fixa (30–70 m) em relação ao ponto real. Mesmo que
//     alguém marque a própria casa, a rota não leva até o portão.
// ---------------------------------------------------------------------------

export const ROUTE_HOT_HOURS = 6;
export const ROUTE_MAX_HOURS = 48;
export const ROUTE_AREA_RADIUS_M = 150;
const AREA_MIN_OFFSET_M = 30;
const AREA_MAX_OFFSET_M = 70;

const HOUR_MS = 60 * 60 * 1000;

const toValidCoordinate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
};

const getCoordinates = (latitude, longitude) => {
  const validLatitude = toValidCoordinate(latitude);
  const validLongitude = toValidCoordinate(longitude);
  if (validLatitude == null || validLongitude == null) return null;
  return { latitude: validLatitude, longitude: validLongitude };
};

const toTime = (value) => {
  if (!value) return null;
  const raw = String(value);
  // Datas "AAAA-MM-DD" (sem hora) são tratadas como meio-dia local
  const time = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`).getTime()
    : new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
};

const isAdoptionItem = (item, extra) =>
  item.status === 'adoption' || Boolean(extra.is_direct_adoption || extra.available_for_adoption);

// Hash simples e estável (mesma entrada => mesmo deslocamento em todos os celulares)
const stableHash = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Centro da área de busca: o ponto real deslocado 30–70 m numa direção fixa. */
export const getSearchAreaCenter = (point, seed) => {
  const hash = stableHash(String(seed));
  const angle = ((hash % 360) * Math.PI) / 180;
  const fraction = ((hash >>> 9) % 1000) / 1000;
  const distanceM = AREA_MIN_OFFSET_M + fraction * (AREA_MAX_OFFSET_M - AREA_MIN_OFFSET_M);
  const dLat = (distanceM * Math.cos(angle)) / 111320;
  const dLng = (distanceM * Math.sin(angle)) / (111320 * Math.cos((point.latitude * Math.PI) / 180));
  return {
    latitude: point.latitude + dLat,
    longitude: point.longitude + dLng,
  };
};

/**
 * Pista pública mais recente do animal (ou null).
 * { latitude, longitude, seenAt, source: 'street_found' | 'street_sighting' }
 */
export const getLatestPublicClue = (item) => {
  if (!item) return null;
  const extra = item.extra_fields || {};
  const candidates = [];

  // Encontrado solto na rua e ninguém levou: o ponto do registro é uma via pública
  const isSpotted = item.status === 'found' && extra.found_custody === 'spotted' && !isAdoptionItem(item, extra);
  if (isSpotted) {
    const locationDetails = extra.location_details || {};
    const point = getCoordinates(
      item.latitude ?? locationDetails.latitude ?? extra.latitude,
      item.longitude ?? locationDetails.longitude ?? extra.longitude
    );
    const createdAt = toTime(item.created_at);
    const dateAt = toTime(item.date);
    // O dia informado vale quando é anterior à publicação (achou ontem, publicou hoje)
    const seenAt = dateAt && createdAt && dateAt < createdAt - 24 * HOUR_MS ? dateAt : (createdAt || dateAt);
    if (point && seenAt) candidates.push({ ...point, seenAt, source: 'street_found' });
  }

  // Avistamentos na rua (perdidos e também os vistos na rua)
  if (item.status === 'lost' || isSpotted) {
    const hasPublicSummary = extra.last_public_sighting_at !== undefined;
    const point = hasPublicSummary
      ? getCoordinates(extra.last_public_sighting_lat, extra.last_public_sighting_lng)
      : getCoordinates(extra.last_sighting_lat, extra.last_sighting_lng); // dados antigos
    const seenAt = toTime(hasPublicSummary ? extra.last_public_sighting_at : extra.last_sighting_at);
    if (point && seenAt) candidates.push({ ...point, seenAt, source: 'street_sighting' });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.seenAt - a.seenAt)[0];
};

/**
 * Situação da rota para um animal.
 * {
 *   available: boolean,
 *   reason: 'ok' | 'none' | 'resolved' | 'protected' | 'no_clue' | 'cold',
 *   freshness: 'hot' | 'warm' | 'cold' | null,
 *   ageHours, clue, area: { latitude, longitude, radiusM } | null
 * }
 */
export const getRouteStatus = (item, now = Date.now()) => {
  const empty = { available: false, freshness: null, ageHours: null, clue: null, area: null };
  if (!item) return { ...empty, reason: 'none' };

  const extra = item.extra_fields || {};
  if (item.resolved || item.status === 'resolved') return { ...empty, reason: 'resolved' };

  const isSheltered = item.status === 'found' && extra.found_custody !== 'spotted';
  if (isAdoptionItem(item, extra) || isSheltered) return { ...empty, reason: 'protected' };

  const clue = getLatestPublicClue(item);
  if (!clue) return { ...empty, reason: 'no_clue' };

  const ageHours = Math.max(0, (now - clue.seenAt) / HOUR_MS);
  const freshness = ageHours <= ROUTE_HOT_HOURS ? 'hot' : (ageHours <= ROUTE_MAX_HOURS ? 'warm' : 'cold');
  const center = getSearchAreaCenter(clue, `${item.id}|${clue.seenAt}`);

  return {
    available: freshness !== 'cold',
    reason: freshness === 'cold' ? 'cold' : 'ok',
    freshness,
    ageHours,
    clue,
    area: { ...center, radiusM: ROUTE_AREA_RADIUS_M },
  };
};

/** Compatibilidade: destino da rota (centro da área) ou null. */
export const getPublicRouteTarget = (item) => {
  const status = getRouteStatus(item);
  if (!status.available) return null;
  return {
    latitude: status.area.latitude,
    longitude: status.area.longitude,
    source: status.clue.source,
  };
};

export const canTraceRouteToItem = (item) => getRouteStatus(item).available;

/** "há 40 min", "há 5 h", "há 3 dias" */
export const formatClueAge = (ageHours) => {
  if (ageHours == null || !Number.isFinite(ageHours)) return '';
  const minutes = Math.round(ageHours * 60);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  if (ageHours < 24) return `há ${Math.round(ageHours)} h`;
  const days = Math.round(ageHours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
};

/** Textos prontos para a interface, conforme a situação da rota. */
export const describeRouteStatus = (status) => {
  const age = formatClueAge(status?.ageHours);
  const what = status?.clue?.source === 'street_found' ? 'Visto na rua' : 'Último avistamento';
  switch (status?.reason) {
    case 'ok':
      return status.freshness === 'hot'
        ? { tone: 'hot', title: `Pista quente · ${what.toLowerCase()} ${age}`, text: 'Deve estar por perto. A rota leva até a área onde foi visto.' }
        : { tone: 'warm', title: `Pista morna · ${what.toLowerCase()} ${age}`, text: 'Pode ter se afastado. Procure nos arredores da área marcada.' };
    case 'cold':
      return { tone: 'cold', title: `Pista fria · ${what.toLowerCase()} ${age}`, text: 'Sem rota: a pista é antiga. Viu o pet? Registre em "Vi o Pet" para reativar.' };
    case 'no_clue':
      return { tone: 'cold', title: 'Ainda sem pista na rua', text: 'A rota aparece quando alguém registrar um avistamento. Viu o pet? Toque em "Vi o Pet".' };
    case 'protected':
      return { tone: 'protected', title: 'Endereço protegido', text: 'Este animal está em uma casa. Fale com o responsável pelo chat na página do animal.' };
    default:
      return null;
  }
};

// Avistamento em casa/quintal: o ponto já vem arredondado (~1 km), então o
// círculo do histórico é bem maior e não sugere um imóvel.
const PRIVATE_HISTORY_RADIUS_M = 600;

/**
 * Círculos do histórico de avistamentos (mais recente primeiro), a partir do
 * rastro de `getItemSightingTrail`. Usa a mesma área deslocada da rota: nunca
 * o ponto exato marcado. O local de desaparecimento (casa do tutor) fica de fora;
 * o ponto de um animal visto solto na rua entra como o primeiro avistamento.
 * [{ id, latitude, longitude, radiusM, ageHours, freshness, userName, isPrivate }]
 */
export const getSightingHistoryAreas = (item, trailSteps, now = Date.now()) => {
  if (!item || !Array.isArray(trailSteps)) return [];
  const extra = item.extra_fields || {};
  const includeInitial = item.status === 'found' && extra.found_custody === 'spotted';

  return trailSteps
    .filter((step) => step && (step.type === 'sighting' || (includeInitial && step.type === 'initial')))
    .map((step) => {
      const point = getCoordinates(step.latitude, step.longitude);
      const seenAt = toTime(step.date);
      if (!point || !seenAt) return null;
      const isPrivate = step.animal_place === 'private';
      const id = String(step.id || `initial-${item.id}`);
      const center = isPrivate ? point : getSearchAreaCenter(point, `${item.id}|${id}`);
      const ageHours = Math.max(0, (now - seenAt) / HOUR_MS);
      return {
        id,
        ...center,
        radiusM: isPrivate ? PRIVATE_HISTORY_RADIUS_M : ROUTE_AREA_RADIUS_M,
        ageHours,
        freshness: ageHours <= ROUTE_HOT_HOURS ? 'hot' : (ageHours <= ROUTE_MAX_HOURS ? 'warm' : 'cold'),
        userName: step.user_name || 'Membro da comunidade',
        isPrivate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ageHours - b.ageHours);
};

// ---------------------------------------------------------------------------
// Meios de transporte da rota
// ---------------------------------------------------------------------------
//  - osrmProfile: perfil do servidor de rotas OSRM (routing.openstreetmap.de).
//    O transporte público não existe no OSRM: essa opção abre direto o
//    Google Maps, que calcula linhas e horários.
//  - metersPerMin: velocidade média usada quando o servidor não devolve o tempo.
// ---------------------------------------------------------------------------
export const ROUTE_MODES = {
  foot: { key: 'foot', label: 'A pé', shortLabel: 'a pé', icon: 'directions-walk', osrmProfile: 'foot', googleMode: 'walking', metersPerMin: 80 },
  bike: { key: 'bike', label: 'Bicicleta', shortLabel: 'de bicicleta', icon: 'directions-bike', osrmProfile: 'bike', googleMode: 'bicycling', metersPerMin: 250 },
  car: { key: 'car', label: 'Carro', shortLabel: 'de carro', icon: 'directions-car', osrmProfile: 'car', googleMode: 'driving', metersPerMin: 500 },
  transit: { key: 'transit', label: 'Ônibus', shortLabel: 'de ônibus', icon: 'directions-bus', osrmProfile: null, googleMode: 'transit', metersPerMin: null },
};
export const ROUTE_MODE_ORDER = ['foot', 'bike', 'car', 'transit'];
export const DEFAULT_ROUTE_MODE = 'foot';

export const getRouteMode = (key) => ROUTE_MODES[key] || ROUTE_MODES[DEFAULT_ROUTE_MODE];

/** Link do Google Maps até o centro da área, no meio de transporte escolhido. */
export const buildGoogleMapsUrl = (area, modeKey = DEFAULT_ROUTE_MODE) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(area.latitude).toFixed(6)},${Number(area.longitude).toFixed(6)}&travelmode=${getRouteMode(modeKey).googleMode}`;
