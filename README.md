# Captcha Service

Servicio para obtener y validar captchas del SII (Servicio de Impuestos Internos de Chile).

## Requisitos

- Node.js (v14 o superior)
- npm o yarn
- Puppeteer

## Instalación

1. Clonar el repositorio:

```bash
git clone git@github.com:ApplicaMobile/captcher.git
cd captcher
```

2. Instalar dependencias:

```bash
npm install
```

3. Iniciar el servidor:

```bash
npm run start:dev
```

## Uso

### Endpoints

#### 1. Obtener Nuevo Captcha

```http
POST /captcha/submit
Content-Type: application/json

{
    "region": "13",
    "comuna": "13101",
    "manzana": "12345",
    "predio": "67890"
}
```

#### 2. Recuperar Captcha por SessionID

```http
GET /captcha/session/{sessionId}
```

### Ejemplos de Postman

#### Región Metropolitana (13)

```http
POST /captcha/submit
Content-Type: application/json

{
    "region": "13",
    "comuna": "13101",
    "manzana": "12345",
    "predio": "67890"
}
```

#### Región de Valparaíso (05)

```http
POST /captcha/submit
Content-Type: application/json

{
    "region": "05",
    "comuna": "05101",
    "manzana": "12345",
    "predio": "67890"
}
```

#### Región de O'Higgins - Rancagua (06)

```http
POST /captcha/submit
Content-Type: application/json

{
    "region": "06",
    "comuna": "06101",
    "manzana": "500",
    "predio": "295"
}
```

### Códigos de Regiones y Comunas

#### Regiones Principales

- Región Metropolitana: 13
- Región de Valparaíso: 05
- Región del Libertador Bernardo O'Higgins: 06
- Región del Maule: 07
- Región del Biobío: 08

#### Comunas Ejemplo

- Santiago: 13101
- Providencia: 13123
- Las Condes: 13114
- Valparaíso: 05101
- Viña del Mar: 05109
- Rancagua: 06101
- Talca: 07101
- Concepción: 08101

## Respuestas del Servicio

### Nuevo Captcha (POST /captcha/submit)

```json
{
  "sessionId": "string",
  "captcha": "url_string",
  "captchaBase64": "base64_string"
}
```

### Recuperar Captcha (GET /captcha/session/{sessionId})

```json
{
  "captcha": "url_string",
  "captchaBase64": "base64_string"
}
```

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
PORT=3000
```

## Scripts Disponibles

- `npm run start`: Inicia el servidor en producción
- `npm run start:dev`: Inicia el servidor en modo desarrollo
- `npm run test`: Ejecuta los tests
- `npm run build`: Compila el proyecto

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.
