export const isResidentialAddressPrivate = (item) => {
  if (!item) return false;

  const extraFields = item.extra_fields && typeof item.extra_fields === 'object'
    ? item.extra_fields
    : {};
  const isAdoption = item.status === 'adoption' ||
    Boolean(extraFields.is_direct_adoption || extraFields.available_for_adoption);
  const isFoundAtHome = item.status === 'found' && extraFields.found_custody !== 'spotted';

  return isAdoption || isFoundAtHome;
};

export const shouldHideHouseNumber = (item) =>
  isResidentialAddressPrivate(item) || item?.status === 'lost';

export const roundPublicCoordinate = (value) => {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) return null;
  return Math.sign(coordinate) * Math.round(Math.abs(coordinate) * 100) / 100;
};

export const removeHouseNumberFromStreet = (street) =>
  String(street || '')
    .replace(/[,;]\s*(?:n[ºo]\s*)?\d+\b.*$/i, '')
    .replace(/\s+n[ºo]\s*\d+\b.*$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .trim();

/**
 * Remove o número da casa de um endereço completo, mantendo o resto.
 * "Rua das Flores, 123 - Centro - Pelotas - RS" -> "Rua das Flores - Centro - Pelotas - RS"
 */
export const removeHouseNumberFromAddress = (address) =>
  String(address || '')
    .replace(/\s*,\s*(?:n[ºo°]\.?\s*)?\d+[a-zA-Z]?(?=\s*(?:-\s|,|;|$))/gi, '')
    .replace(/\s+n[ºo°]\.?\s*\d+[a-zA-Z]?(?=\s*(?:-\s|,|;|$))/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const getPrivateLocationSummary = (item, { includeCityState = true } = {}) => {
  const extraFields = item?.extra_fields && typeof item.extra_fields === 'object'
    ? item.extra_fields
    : {};
  const locationDetails = extraFields.location_details || {};
  const district = String(
    locationDetails.district ||
    locationDetails.neighborhood ||
    item?.neighborhood ||
    extraFields.neighborhood ||
    ''
  ).trim();
  const city = String(locationDetails.city || item?.city || extraFields.city || '').trim();
  const state = String(locationDetails.state || item?.state || extraFields.state || '').trim();
  const cityState = includeCityState ? [city, state].filter(Boolean).join(' - ') : '';
  const parts = [
    district ? `Região do Bairro ${district} (Endereço protegido)` : 'Endereço protegido',
    cityState,
  ].filter(Boolean);

  return parts.join(' • ');
};
