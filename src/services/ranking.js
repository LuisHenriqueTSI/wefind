import { supabase } from '../lib/supabase';

const SCORE_RULES = {
  publication: 10,
  reunion: 60,
  foster: 25,
};

const getWeekStart = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDisplayName = (name, email) => {
  const value = String(name || email || 'Membro WeFIND').trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Membro WeFIND';
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
};

const safeQuery = async (query, fallback = []) => {
  const { data, error } = await query;
  if (error) {
    console.warn('[ranking] Consulta parcial indisponível:', error.message);
    return fallback;
  }
  return data || fallback;
};

export const getWeeklyRanking = async (currentUserId, city = null) => {
  const weekStart = getWeekStart();
  const weekStartIso = weekStart.toISOString();

  const [profiles, items, fosters] = await Promise.all([
    safeQuery(
      supabase
        .from('profiles')
        .select('id, name, city, state, avatar_url')
        .limit(1000)
    ),
    safeQuery(
      supabase
        .from('items')
        .select('owner_id, status, resolved, created_at, updated_at, city')
        .limit(5000)
    ),
    safeQuery(
      supabase
        .from('foster_volunteers')
        .select('user_id, is_active, created_at')
        .eq('is_active', true)
        .limit(1000)
    ),
  ]);

  const normalizedCity = String(city || '').trim().toLocaleLowerCase();
  const visibleProfiles = profiles.filter((profile) => (
    !normalizedCity || String(profile.city || '').trim().toLocaleLowerCase() === normalizedCity
  ));
  const visibleIds = new Set(visibleProfiles.map((profile) => String(profile.id)));
  const scores = new Map();

  visibleProfiles.forEach((profile) => {
    scores.set(String(profile.id), {
      userId: profile.id,
      name: getDisplayName(profile.name, profile.email),
      city: profile.city || 'Comunidade',
      state: profile.state || '',
      avatarUrl: profile.avatar_url || null,
      score: 0,
      actions: 0,
    });
  });

  items.forEach((item) => {
    const ownerId = String(item.owner_id || '');
    const entry = scores.get(ownerId);
    if (!entry || !visibleIds.has(ownerId)) return;

    const createdThisWeek = item.created_at && new Date(item.created_at) >= weekStart;
    const resolvedThisWeek = (
      (item.resolved === true || item.status === 'resolved') &&
      item.updated_at &&
      new Date(item.updated_at) >= weekStart
    );

    if (createdThisWeek) {
      entry.score += SCORE_RULES.publication;
      entry.actions += 1;
    }
    if (resolvedThisWeek) {
      entry.score += SCORE_RULES.reunion;
      entry.actions += 1;
    }
  });

  fosters.forEach((foster) => {
    const entry = scores.get(String(foster.user_id || ''));
    if (!entry || !foster.created_at || new Date(foster.created_at) < weekStart) return;
    entry.score += SCORE_RULES.foster;
    entry.actions += 1;
  });

  const ranking = Array.from(scores.values())
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, position: index + 1 }));

  const ownPosition = ranking.find((entry) => String(entry.userId) === String(currentUserId)) || null;

  return {
    ranking,
    topTen: ranking.slice(0, 10),
    ownPosition,
    weekStart,
    city: city || null,
  };
};

