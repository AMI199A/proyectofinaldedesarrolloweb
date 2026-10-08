# Arquitectura del sistema

## Objetivo

El proyecto busca ofrecer un panel de clima y alertas ambientales que permita a los usuarios consultar información meteorológica, guardar ciudades favoritas y consultar consultas previas con fines de seguimiento.

## Arquitectura general

El sistema se compone de tres capas principales:

1. Frontend React
   - Presenta la interfaz visual del sistema.
   - Realiza validaciones del cliente.
   - Consume la API del backend.

2. Backend Node.js + Express
   - Expone endpoints REST.
   - Gestiona autenticación y autorización mediante JWT.
   - Valida datos de entrada.
   - Consulta la API externa de clima.
   - Gestiona la base de datos.

3. Base de datos PostgreSQL
   - Guarda usuarios.
   - Registra ubicaciones favoritas.
   - Almacena historial de búsquedas.
   - Mantiene registros de alertas y condiciones relevantes.

## Diagrama de flujo

```text
Usuario -> Frontend React -> API Backend -> Open-Meteo
                              -> PostgreSQL
```

## Modelo de datos

### Entidad: usuarios
- id
- name
- email
- password_hash
- created_at

### Entidad: favorite_locations
- id
- user_id
- name
- country
- latitude
- longitude
- created_at

### Entidad: weather_queries
- id
- user_id
- city_name
- country_name
- temperature
- alert_type
- created_at

### Entidad: alerts
- id
- user_id
- city_name
- alert_type
- message
- created_at

## Principios de diseño

- Separación clara entre frontend, backend y persistencia.
- API REST con rutas organizadas por dominio.
- Seguridad integrada desde el inicio.
- Diseño responsivo con estructura clara y accesible.
- Persistencia relacional para consultas y reportes.
