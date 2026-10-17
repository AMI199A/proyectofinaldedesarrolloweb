Para activar las capas meteorológicas, crea una API key de OpenWeatherMap y agrega `OPENWEATHER_API_KEY` en `backend/.env`, usando `backend/.env.example` como guía. La clave se mantiene en el servidor; el mapa incluye capas de precipitación, temperatura, viento y nubosidad. Sin la clave, se conserva el mapa base y las alertas derivadas del pronóstico siguen funcionando.
# Panel de Clima y Alertas Ambientales

Aplicación web full stack para consultar clima en distintas ciudades, guardar ubicaciones favoritas, consultar historial y generar alertas ambientales.

## Descripción del proyecto

El sistema permite a los usuarios registrarse e iniciar sesión, buscar el clima actual y el pronóstico de una ciudad, guardar ubicaciones favoritas, consultar el historial y recibir alertas cuando la condición climática se considera crítica o relevante para la actividad del usuario.

## Stack tecnológico

- Frontend: React + Vite + Bootstrap
- Backend: Node.js + Express
- Base de datos: PostgreSQL
- Contenedores: Docker / Docker Compose
- Seguridad: JWT, validación de entradas, hashing de contraseñas, protección contra XSS y SQL injection con consultas parametrizadas
- API externa: Open-Meteo

## Estructura del repositorio

- frontend/: aplicación React con diseño responsivo
- backend/: API REST con autenticación y lógica de negocio
- database/: scripts SQL de base de datos y datos iniciales
- external-api/: documentación y ejemplos de consumo de servicios externos
- docs/: arquitectura, seguridad OWASP y entregables del curso
- .github/workflows/: pipeline CI/CD
- docker-compose.yml: entorno local con frontend, backend y PostgreSQL

## Requisitos previos

- Node.js 18+
- Docker y Docker Compose
- PostgreSQL 16 (si se desea ejecutar sin Docker)

## Inicio rápido con Docker

1. Clonar el repositorio.
2. Crear las variables de entorno desde los archivos `.env.example`.
3. Ejecutar:

```bash
docker compose up --build
```

4. Abrir la aplicación en:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:4000
   - PostgreSQL: localhost:5432

## Variables de entorno

Para habilitar el acceso social, crea un proyecto en Firebase, registra una aplicación web y activa Google, Facebook y Apple en Authentication > Sign-in method. En Firebase Authentication > Settings > Authorized domains agrega `localhost` para desarrollo. Facebook y Apple también requieren configurar sus aplicaciones en los respectivos portales y registrar allí los datos que solicita Firebase.

Completa `frontend/.env` con los valores públicos de la aplicación web de Firebase, tomando como base `frontend/.env.example`. En `backend/.env`, configura `FIREBASE_SERVICE_ACCOUNT_JSON` con el contenido de una clave de cuenta de servicio del mismo proyecto; no publiques ni compartas esa clave. La API verifica cada ID token con Firebase Admin antes de crear la sesión local.

Para activar las capas meteorológicas, crea una API key de Tomorrow.io y agrega `TOMORROW_API_KEY` en `backend/.env`, usando `backend/.env.example` como guía. La clave se mantiene en el servidor; el mapa incluye capas de precipitación, temperatura, viento y nubosidad. Sin la clave, se conserva el mapa base y las alertas derivadas del pronóstico siguen funcionando.

Después de configurar las variables, recrea los servicios para que Docker cargue la configuración:

```bash
docker compose up -d --build backend frontend
```

Backend:

```env
PORT=4000
JWT_SECRET=supersecretkey
DATABASE_URL=postgresql://postgres:postgres@db:5432/clima_app
OPENWEATHER_BASE_URL=https://api.open-meteo.com/v1
OPENWEATHER_API_KEY=your_openweathermap_api_key
OPENWEATHER_MAP_TILES_URL=https://tile.openweathermap.org/map
FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

Frontend:

```env
VITE_API_URL=http://localhost:4000/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

## Funcionalidades principales

- Registro e inicio de sesión de usuarios
- Inicio de sesión social con Google, Facebook y Apple mediante Firebase Authentication
- Búsqueda de clima por ciudad
- Visualización del clima actual y pronóstico
- Guardado de ubicaciones favoritas
- Historial de consultas por usuario
- Alertas según condiciones climáticas
- Capas de precipitación, temperatura, viento y nubes con OpenWeatherMap
- Alertas geolocalizadas visibles en el mapa y en la lista de actividad
- Validación tanto en frontend como backend
- Diseño responsivo y moderno

## Seguridad aplicada

El proyecto aplica prácticas OWASP relevantes:

- validación de entrada del cliente y del servidor
- prevención de inyección SQL con consultas parametrizadas
- almacenamiento seguro de contraseñas con bcrypt
- uso de JWT para control de acceso
- limpieza e escape de datos renderizados en frontend
- control de rutas protegidas

## Pipeline CI/CD

El repositorio incluye una configuración de GitHub Actions en `.github/workflows/ci.yml` que valida:

- instalación de dependencias
- build del frontend
- pruebas básicas del backend
- preparación del artefacto de despliegue

## Equipo

- Ana García
- Carlos López
- Daniela Pérez
- Luis Ramírez

## Documentación adicional

- [docs/arquitectura.md](docs/arquitectura.md)
- [docs/seguridad-owasp.md](docs/seguridad-owasp.md)
- [database/init.sql](database/init.sql)

## Licencia

Proyecto académico para Desarrollo Web, Universidad Mariano Gálvez de Guatemala.
