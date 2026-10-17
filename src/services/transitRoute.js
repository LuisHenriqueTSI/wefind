// ---------------------------------------------------------------------------
// Rota de transporte público (ônibus, metrô, trem)
// ---------------------------------------------------------------------------
// O servidor de rotas OSRM não tem transporte público, e a chave do Google do
// app não tem a API de rotas liberada. Usamos o Transitous (transitous.org),
// serviço gratuito e comunitário que monta o trajeto com linhas e horários a
// partir dos dados abertos (GTFS) publicados por cada cidade.
// Só funciona nas cidades que publicam esses dados: sem itinerário, quem chama
// mostra a rota a pé e oferece o Google Maps.
// ---------------------------------------------------------------------------

const TRANSITOUS_PLAN_URL = 'https://api.transitous.org/api/v1/plan';
const REQUEST_TIMEOUT_MS = 8000;

const WALK_COLOR = '#64748B';
const DEFAULT_TRANSIT_COLOR = '#2563EB';

const LEG_LABELS = {
  WALK: 'a pé',
  BUS: 'ônibus',
  TRAM: 'bonde',
  SUBWAY: 'metrô',
  RAIL: 'trem',
  REGIONAL_RAIL: 'trem',
  HIGHSPEED_RAIL: 'trem',
  LONG_DISTANCE: 'trem',
  METRO: 'metrô',
  FERRY: 'barca',
  COACH: 'ônibus',
};

const LEG_ICONS = {
  WALK: 'directions-walk',
  SUBWAY: 'subway',
  METRO: 'subway',
  RAIL: 'train',
  REGIONAL_RAIL: 'train',
  HIGHSPEED_RAIL: 'train',
  LONG_DISTANCE: 'train',
  TRAM: 'tram',
  FERRY: 'directions-boat',
};

/** Decodifica uma polyline do Google/MOTIS com a precisão informada (5, 6 ou 7). */
export const decodePolyline = (encoded, precision = 5) => {
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
};

const formatClock = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Melhor itinerário de transporte público entre dois pontos, ou null quando a
 * cidade não tem dados (ou o trajeto é tão curto que só existe a pé).
 * {
 *   segments: [{ key, mode, coordinates, color, dashed }],
 *   legs: [{ mode, icon, label, minutes, color }],
 *   durationMin, distanceM, departureText,
 * }
 */
export const fetchTransitItinerary = async (from, to) => {
  const url = `${TRANSITOUS_PLAN_URL}?fromPlace=${from.latitude},${from.longitude}&toPlace=${to.latitude},${to.longitude}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'WeFindApp/1.0 (React Native Mobile)' },
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Só vale um itinerário que realmente use transporte público
    const itinerary = (data?.itineraries || []).find((it) =>
      (it?.legs || []).some((leg) => leg?.mode && leg.mode !== 'WALK')
    );
    if (!itinerary) return null;

    const segments = [];
    const legs = [];
    let distanceM = 0;
    itinerary.legs.forEach((leg, index) => {
      const isWalk = leg.mode === 'WALK';
      const color = isWalk ? WALK_COLOR : (leg.routeColor ? `#${leg.routeColor}` : DEFAULT_TRANSIT_COLOR);
      const geometry = leg.legGeometry;
      const coordinates = geometry?.points ? decodePolyline(geometry.points, geometry.precision || 5) : [];
      if (coordinates.length > 1) {
        segments.push({ key: `leg-${index}`, mode: leg.mode, coordinates, color, dashed: isWalk });
      }
      if (Number.isFinite(leg.distance)) distanceM += leg.distance;

      const minutes = Math.max(1, Math.round((leg.duration || 0) / 60));
      // Trechos a pé muito curtos (troca de plataforma) não entram no resumo
      if (isWalk && minutes < 2) return;
      legs.push({
        mode: leg.mode,
        icon: LEG_ICONS[leg.mode] || 'directions-bus',
        label: isWalk ? `${minutes} min` : (leg.routeShortName || leg.displayName || LEG_LABELS[leg.mode] || 'linha'),
        minutes,
        color,
      });
    });

    if (segments.length === 0) return null;

    const firstTransit = itinerary.legs.find((leg) => leg.mode !== 'WALK');
    const departure = firstTransit?.from?.departure || firstTransit?.startTime;
    const stopName = firstTransit?.from?.name;

    return {
      segments,
      legs,
      durationMin: Math.max(1, Math.round((itinerary.duration || 0) / 60)),
      distanceM,
      departureText: departure ? `Embarque às ${formatClock(departure)}${stopName ? ` em ${stopName}` : ''}` : '',
      arrivalText: itinerary.endTime ? `chegada ${formatClock(itinerary.endTime)}` : '',
    };
  } catch (err) {
    console.log('[transitRoute] Aviso no Transitous:', err?.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};
