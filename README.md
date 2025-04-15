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
npm run start:debug
```

## Uso

### Endpoints

#### 1. Obtener Captcha

```http
POST http://localhost:3000/captcha/submit
Content-Type: application/json

{
    "region": "06",
    "comuna": "06101",
    "manzana": "500",
    "predio": "295",
}
```

### Ejemplos de Postman

#### Región Metropolitana (13)

```http
POST http://localhost:3000/captcha/submit
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
POST http://localhost:3000/captcha/submit
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
POST http://localhost:3000/captcha/submit
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

## Respuesta del Servicio

La respuesta incluirá:

```json
{
  "sessionId": "string",
  "captcha": "data:image/png;base64,..."
}
```

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
PORT=3000
```

## Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.
