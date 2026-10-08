# Seguridad OWASP aplicada

## Riesgos identificados y mitigaciones

### 1. Inyección SQL
- Mitigación: uso de consultas parametrizadas en PostgreSQL.
- Se evita concatenar variables directamente en consultas.

### 2. Autenticación débil
- Mitigación: registro y login con validación de correo, password segura y JWT para sesiones.

### 3. Almacenamiento inseguro de contraseñas
- Mitigación: uso de bcrypt para hashear contraseñas antes de almacenarlas.

### 4. XSS
- Mitigación: renderizado controlado en frontend y validación de entradas desde el servidor.
- Se evita mostrar contenido no sanitizado directamente sin control.

### 5. Exposición de rutas protegidas
- Mitigación: middleware de autenticación que exige token válido antes de acceder a ciertos endpoints.

### 6. Validación insuficiente de entradas
- Mitigación: validación del correo, longitud mínima de contraseñas y validación de nombres y ciudades requeridos.

## Recomendaciones de ampliación

- Activar HTTPS en producción.
- Usar rate limiting por IP y por usuario.
- Añadir refresh tokens y expiración más estricta.
- Integrar auditoría de logs para eventos críticos.
- Configurar encabezados de seguridad en el frontend/backend.
