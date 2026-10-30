# Panel de Clima y Alertas Ambientales (Clima Jarvis Squad)

Aplicación web full stack para consultar clima en distintas ciudades, guardar ubicaciones favoritas, monitorear sensores IoT en tiempo real (ESP32 / Node-RED) y autenticación centralizada mediante **Keycloak 26**.

## Descripción del proyecto

El sistema permite a los usuarios autenticarse mediante **Keycloak** (OpenID Connect con Standard Flow + PKCE S256), buscar el clima actual y pronósticos meteorológicos de cualquier ciudad, guardar ubicaciones favoritas, consultar el historial de consultas y recibir alertas meteorológicas críticas. Además, integra telemetría IoT desde microcontroladores ESP32 a través de flujos en Node-RED con almacenamiento en PostgreSQL.

## Stack tecnológico

- **Frontend**: React 18 + Vite + Leaflet Maps + Keycloak-js
- **Backend**: Node.js + Express + JWKS RSA (`jwks-rsa`)
- **Autenticación**: Keycloak 26 (`quay.io/keycloak/keycloak:26.0`) con Realm `jarvis`
- **Base de datos**: PostgreSQL 16
- **IoT & Middleware**: Node-RED + ESP32 (HTTP Ingest)
- **Contenedores**: Docker & Docker Compose
- **APIs externas**: Open-Meteo, OpenStreetMap, OpenWeatherMap (opcional)

---

## Estructura del repositorio

- `frontend/`: Aplicación React empaquetada con Nginx y autenticación `keycloak-js`.
- `backend/`: API REST en Express con validación de tokens JWT mediante certificados JWKS de Keycloak.
- `keycloak/`: Archivo `realm-export.json` importado automáticamente al arrancar el contenedor de Keycloak.
- `database/`: Scripts SQL de base de datos e inicialización (`init.sql`).
- `node-red/`: Flujos de ingestión IoT y telemetría de sensores (`flows.json`).
- `esp32/`: Código Arduino para el microcontrolador ESP32 (`esp32_weather.ino`).
- `docker-compose.yml`: Orquestación multi-contenedor de todos los servicios.

---

## Inicio rápido con Docker

### 1. Requisitos previos
- Docker Desktop instalado y en ejecución.
- Git.

### 2. Configurar variables de entorno
Copia los archivos de ejemplo si deseas personalizar puertos o contraseñas:
```bash
cp .env.example .env
```
*(Para desarrollo local no es obligatorio editarlos, los valores por defecto funcionan de inmediato).*

### 3. Levantar los contenedores
Ejecuta en la raíz del proyecto:

```bash
docker compose up --build -d
```

*(En Windows PowerShell también puedes usar `docker-compose up --build -d`).*

### 4. Accesos a los servicios locales
- **Frontend (Aplicación)**: [http://localhost:5173](http://localhost:5173) (o [http://localhost:3000](http://localhost:3000) si se mapea a ese puerto)
- **Consola de Administración de Keycloak**: [http://localhost:8081](http://localhost:8081)
- **API Backend (Health check)**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **Editor de flujos Node-RED**: [http://localhost:1880](http://localhost:1880)
- **Base de datos PostgreSQL**: `localhost:5432`

---

## Despliegue en Máquina Virtual Azure (Ubuntu) con IP Pública (HTTP)

### 1. Configuración de Red en Azure (Network Security Group - NSG)
En el portal de Azure, asegúrate de que el Grupo de Seguridad de Red (NSG) asociado a tu Máquina Virtual tenga reglas de entrada (Inbound security rules) permitiendo el tráfico TCP para los siguientes puertos:
- **Port 5173**: Frontend Web (React / Nginx)
- **Port 4000**: Backend API (Express)
- **Port 8081**: Keycloak SSO (Autenticación OpenID Connect)
- **Port 1880**: Node-RED (Editor y flujos IoT)
- **Port 22**: SSH (Acceso remoto)

### 2. Preparación en la Máquina Virtual Ubuntu
Conéctate por SSH a tu servidor Ubuntu e instala Docker y Git si aún no los tienes:
```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Clonar el repositorio y configurar variables
```bash
git clone -b pruebas git@github.com:AMI199A/proyectofinaldedesarrolloweb.git
cd proyectofinaldedesarrolloweb
cp .env.example .env
```
Edita `.env` con la IP pública de tu máquina virtual Azure (por ejemplo, con `nano .env`):
```env
KC_URL=http://<IP_PUBLICA_AZURE>:8081
FRONTEND_URL=http://<IP_PUBLICA_AZURE>:5173
VITE_KC_URL=http://<IP_PUBLICA_AZURE>:8081
VITE_API_URL=http://<IP_PUBLICA_AZURE>:4000/api
```
*(Nota: la aplicación cuenta además con detección dinámica en el navegador, por lo que si accedes desde tu IP pública, se comunicará automáticamente a los puertos 8081 y 4000 de la misma máquina).*

### 4. Limpieza y Construcción Completa en Azure
Para arrancar el stack limpio desde cero:
```bash
docker compose down -v && docker compose up -d --build
```

### 5. Verificación de servicios en la IP pública
- **Frontend**: `http://<IP_PUBLICA_AZURE>:5173`
- **Keycloak Admin**: `http://<IP_PUBLICA_AZURE>:8081/admin` (Credenciales: `admin` / `admin`)
- **Backend Health**: `http://<IP_PUBLICA_AZURE>:4000/api/health`
- **Node-RED**: `http://<IP_PUBLICA_AZURE>:1880`

---

## Guía de Keycloak: Consola de Administración y Usuarios

### Acceso a la Consola de Administración
1. Abre tu navegador e ingresa a [http://localhost:8081](http://localhost:8081).
2. Haz clic en **Administration Console**.
3. Inicia sesión con las credenciales de administrador (definidas en `.env`):
   - **Usuario**: `admin`
   - **Contraseña**: `admin`

### Crear un Usuario de Prueba Manualmente en Keycloak
El realm `jarvis` se importa automáticamente al levantar Docker Compose con el cliente público `jarvis-web` y los roles `user` y `admin`.

Para agregar un usuario de prueba:
1. En el menú desplegable superior izquierdo, asegúrate de estar en el Realm **jarvis** (no en *master*).
2. En la barra lateral izquierda, dirígete a **Manage** > **Users**.
3. Haz clic en el botón **Add user** (o **Create new user**).
4. Completa los campos:
   - **Username**: `usuario_prueba`
   - **Email**: `prueba@ejemplo.com`
   - **First name**: `Usuario`
   - **Last name**: `Prueba`
   - **Email verified**: Actívalo en **Yes / On**.
5. Haz clic en **Create**.
6. Ve a la pestaña **Credentials** del usuario:
   - Haz clic en **Set password**.
   - Ingresa una contraseña (por ejemplo, `Prueba123!`).
   - Desactiva la opción **Temporary** (para que no te obligue a cambiarla en el primer login).
   - Confirma haciendo clic en **Save** > **Save password**.
7. Ve a la pestaña **Role mapping**:
   - Haz clic en **Assign role**.
   - Selecciona el rol `user` (y opcionalmente `admin`).
   - Haz clic en **Assign**.

### Registro Directo desde la Aplicación
Dado que el Realm `jarvis` tiene la opción `registrationAllowed: true` habilitada:
1. Entra a [http://localhost:5173](http://localhost:5173).
2. En la tarjeta de bienvenida haz clic en **Registrarme** y presiona **Registrarme con Keycloak**.
3. Keycloak te presentará el formulario estándar de registro de usuario para crear tu cuenta y acceder automáticamente.

---

## Variables de entorno

El archivo `.env` en la raíz define la configuración de puertos y credenciales:

```env
# Puertos locales
FRONTEND_PORT=5173
BACKEND_PORT=4000
POSTGRES_PORT=5432
NODE_RED_PORT=1880
KEYCLOAK_PORT=8081

# Base de datos
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=clima_db
DATABASE_SSL=false

# Keycloak Admin y Configuración
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KC_URL=http://localhost:8081
KC_INTERNAL_URL=http://keycloak:8080
KC_REALM=jarvis
KC_CLIENT_ID=jarvis-web

# Frontend - Keycloak (Vite)
VITE_API_URL=http://localhost:4000/api
VITE_KC_URL=http://localhost:8081
VITE_KC_REALM=jarvis
VITE_KC_CLIENT_ID=jarvis-web

# IoT & Sensores
IOT_DEVICE_CLAIM_CODE=change-device-claim-code
IOT_DEVICE_INGEST_KEY=change-iot-ingest-key

# Opcionales
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
OPENWEATHER_API_KEY=
```

---

## Integración ESP32 → Node-RED → API → PostgreSQL

1. Configura `IOT_DEVICE_CLAIM_CODE` e `IOT_DEVICE_INGEST_KEY` en `.env`.
2. Inicia sesión en el panel web, ve a la sección **Node Clima** y vincula el identificador `esp32-01` con tu código de reclamo.
3. Carga el firmware `esp32/esp32_weather.ino` en tu tarjeta ESP32, indicando la red Wi-Fi y la dirección del host.
4. El firmware envía las lecturas a `http://<IP-HOST>:5173/esp32/telemetry`.
5. El proxy redirige el tráfico hacia el flujo `node-red/flows.json`, que valida la cabecera `x-device-key` y lo envía al endpoint `/api/iot/ingest` del backend para guardarlo en PostgreSQL.

---

## Seguridad aplicada (OWASP)

- **Autenticación robusta**: OpenID Connect con Proof Key for Code Exchange (PKCE S256).
- **Validación criptográfica en backend**: Verificación asimétrica RS256 con JWKS de Keycloak verificando emisor (`iss`), expiración (`exp`) y cliente (`azp`/`aud`).
- **Control de Acceso Basado en Roles (RBAC)**: Middlewares `authenticate` y `requireRole`.
- **Prevención de inyección SQL**: Consultas parametrizadas con `pg`.
- **CORS restrictivo**: Solo orígenes autorizados del frontend tienen acceso a las APIs.
- **Protección de tokens**: El frontend no almacena tokens sensibles en `localStorage`; la sesión es gestionada en memoria por `keycloak-js`.

---

## Equipo

- Ana García
- Carlos López
- Daniela Pérez
- Luis Ramírez

---

## Licencia

Proyecto académico para Desarrollo Web, Universidad Mariano Gálvez de Guatemala.
