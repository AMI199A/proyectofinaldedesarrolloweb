const buildAlert = (type, severity, message) => ({ type, severity, message });

export const getWeatherAlert = (weather) => {
  const current = weather.current;
  const weatherCode = Number(current.weatherCode);

  if ([95, 96, 99].includes(weatherCode)) {
    return buildAlert('Tormenta eléctrica', 'alta', 'Tormenta detectada en esta ubicación.');
  }

  if (current.windSpeed >= 60) {
    return buildAlert('Viento extremo', 'alta', `Vientos de ${Math.round(current.windSpeed)} km/h.`);
  }

  if (current.temperature >= 40 || current.temperature <= -5) {
    return buildAlert('Temperatura extrema', 'alta', `Temperatura actual de ${Math.round(current.temperature)} °C.`);
  }

  if (current.precipitation >= 10) {
    return buildAlert('Lluvia intensa', 'alta', `${current.precipitation} mm de precipitación en la última hora.`);
  }

  if (current.windSpeed >= 40) {
    return buildAlert('Viento fuerte', 'media', `Vientos de ${Math.round(current.windSpeed)} km/h.`);
  }

  if (current.temperature >= 35 || current.temperature <= 3) {
    return buildAlert('Temperatura inusual', 'media', `Temperatura actual de ${Math.round(current.temperature)} °C.`);
  }

  if (current.precipitation >= 2) {
    return buildAlert('Precipitación moderada', 'media', `${current.precipitation} mm de precipitación en la última hora.`);
  }

  if (current.uvIndex >= 11) {
    return buildAlert('Índice UV extremo', 'alta', `Índice UV de ${Number(current.uvIndex).toFixed(1)}.`);
  }

  if (current.uvIndex >= 8) {
    return buildAlert('Índice UV elevado', 'media', `Índice UV de ${Number(current.uvIndex).toFixed(1)}.`);
  }

  return null;
};

export default getWeatherAlert;