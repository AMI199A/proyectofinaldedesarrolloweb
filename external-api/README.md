# API externa de clima

Este proyecto utiliza Open-Meteo como fuente de información meteorológica.

## Servicios utilizados

- Geocodificación: búsqueda de ciudades por nombre
- Predicción meteorológica: condiciones actuales y pronóstico de 3 días

## Ejemplo de consulta

```bash
curl "https://geocoding-api.open-meteo.com/v1/search?name=Guatemala&count=1&language=es&format=json"
```

## Justificación

Open-Meteo ofrece acceso libre y sencillo para consultar condiciones meteorológicas sin depender de claves de API complejas ni costos asociados.

## Consideraciones

- Se deben manejar errores de red.
- Se recomienda limitar llamadas frecuentes por usuario.
- Se debe registrar historial para evitar abuso o uso excesivo.
