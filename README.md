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
- docker-compose.yml: entorno local con frontend, backend, PostgreSQL y Node-RED

## Requisitos previos

- Node.js 18+
- Docker y Docker Compose
- PostgreSQL 16 (si se desea ejecutar sin Docker)

## Inicio rápido con Docker

1. Clonar el repositorio.
2. (Opcional) Copiar `.env.example` a `.env` y configurar las variables que necesites. Para un arranque local no hace falta crear archivos de entorno.
3. Ejecutar:

```bash
docker compose up --build -d
```

4. Abrir la aplicación en:
   - Frontend: http://localhost:5173
   - Estado del backend: http://localhost:4000/api/health
   - PostgreSQL: localhost:5432

Compose espera a que PostgreSQL esté listo antes de iniciar el backend y sirve el frontend compilado en modo producción. Comprueba los servicios con `docker compose ps`; detenlos con `docker compose down`. Los datos de PostgreSQL y Node-RED persisten en volúmenes Docker. La interfaz de Node-RED está disponible localmente en http://localhost:1880; el ESP32 envía su telemetría a través del frontend por el puerto 5173.

## Variables de entorno

Para habilitar el acceso social, crea un proyecto en Firebase, registra una aplicación web y activa Google, Facebook y Apple en Authentication > Sign-in method. En Firebase Authentication > Settings > Authorized domains agrega `localhost` para desarrollo. Facebook y Apple también requieren configurar sus aplicaciones en los respectivos portales y registrar allí los datos que solicita Firebase.

Configura los valores `VITE_FIREBASE_*` en el `.env` de la raíz para incluir Firebase en el build del frontend. En `backend/.env`, configura `FIREBASE_SERVICE_ACCOUNT_JSON` con la clave de cuenta de servicio del mismo proyecto; no publiques ni compartas esa clave. La API verifica cada ID token con Firebase Admin antes de crear la sesión local. Sin esas credenciales, el resto de la aplicación arranca y el acceso social queda deshabilitado.

Para activar las capas meteorológicas, crea una API key de OpenWeatherMap y agrega `OPENWEATHER_API_KEY` en `backend/.env`, usando `backend/.env.example` como guía. La clave se mantiene en el servidor; sin ella, se conserva el mapa base y las alertas derivadas del pronóstico siguen funcionando.

Para activar el asistente, configura `GEMINI_API_KEY` en el `.env` raíz. La clave se usa solo en el backend y no se incorpora al bundle del navegador.

### Integración ESP32 → Node-RED → API → PostgreSQL

1. Configura `IOT_DEVICE_CLAIM_CODE` e `IOT_DEVICE_INGEST_KEY` con valores únicos en el `.env` raíz. Usa el mismo `IOT_DEVICE_INGEST_KEY` en el firmware del ESP32.
2. Abre la interfaz, inicia sesión y selecciona **ESP32 tiempo real**. Vincula el `deviceId` ingresando el código de vinculación configurado en el servidor.
3. Copia `esp32/esp32_weather.ino` al IDE de Arduino, instala las bibliotecas Adafruit BME280 y ArduinoJson y completa Wi-Fi, la IP del servidor y la clave del dispositivo.
4. El firmware publica temperatura, humedad y presión cada 30 segundos. El flujo `node-red/flows.json` valida el mensaje, lo reenvía a la API autenticada entre contenedores y PostgreSQL guarda el historial. El panel muestra hasta las últimas 24 lecturas.
5. Reconstruye y levanta los servicios después de cambiar variables:

```bash
docker compose up --build -d
```

Las lecturas solo se aceptan para dispositivos previamente vinculados a una cuenta. La ruta de Node-RED valida la clave del dispositivo; el editor de Node-RED queda enlazado a localhost y no se publica en la red.

Después de configurar las variables, recrea los servicios para que Docker cargue la configuración:

```bash
docker compose up --build -d frontend
```

El `.env` de la raíz controla los puertos, la URL del backend que usa el navegador, las credenciales públicas de Firebase y la clave JWT local:

```env
FRONTEND_PORT=5173
BACKEND_PORT=4000
POSTGRES_PORT=5432
NODE_RED_PORT=1880
POSTGRES_PASSWORD=postgres
DATABASE_SSL=false
JWT_SECRET=change-this-secret
IOT_DEVICE_CLAIM_CODE=change-device-claim-code
IOT_DEVICE_INGEST_KEY=change-iot-ingest-key
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
VITE_API_URL=http://localhost:4000/api
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Los valores predeterminados están destinados solo al desarrollo local; define contraseñas propias antes de exponer los servicios fuera de tu máquina.

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
