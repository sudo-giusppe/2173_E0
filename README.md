# EnergyShark — Entrega 0 (IIC2173 2026-2)

Sistema distribuido para la ingesta, almacenamiento y consulta histórica de métricas de demanda energética a gran escala.

---

## Información de Despliegue y Acceso

* **Dominio Público:** [http://energy-shark-2173.duckdns.org](http://energy-shark-2173.duckdns.org)
* **IP Pública:**  `18.118.118.215`
* **Región AWS:** `us-east-2` (Ohio)

### Acceso SSH al Servidor EC2
El archivo de clave privada `.pem` ha sido subido directamente al **buzón de entregas en Canvas**

Para conectarse al servidor vía SSH:
```bash
ssh -i <tu-archivo-clave>.pem ubuntu@energy-shark-2173.duckdns.org
# o alternativamente por IP:
ssh -i <tu-archivo-clave>.pem ubuntu@18.118.118.215
```

---


## Arquitectura del Sistema

```
RabbitMQ (broker.iic2173.org:5671 / vhost energy)
   │
   ▼ (AMQPS / SSL TLS)
[ connector ] (NestJS Consumer)
   │
   ▼ (HTTP POST /events)
[ master x2 ] (NestJS Containers — Puertos 3001 y 3002)
   │                                   │
   ▼ (Upstream Proxy)                  ▼ (SSL)
[ Nginx Host (Puerto 80) ]     [ AWS RDS PostgreSQL ]
   │
   ▼
Cliente / Web (http://energy-shark-2173.duckdns.org)
```

---

## Stack Tecnológico

* **Servicio Web (`master`):** Node.js 20, NestJS, TypeORM, `class-validator`, `pg`.
* **Consumidor (`connector`):** Node.js 20, NestJS, `amqplib` (AMQPS TLS).
* **Base de Datos:** AWS RDS PostgreSQL 16.
* **Balanceador de Carga:** Nginx en el host EC2 (Round-Robin).
* **Orquestación:** Docker & Docker Compose v2.
* **Infraestructura:** AWS EC2 (`t3.micro`, Ubuntu 24.04).

---

## Endpoints de la API

| Método | Endpoint | Descripción | Parámetros / Query Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Chequeo de salud del servicio | Ninguno |
| `GET` | `/history` | Historial paginado de demandas | `page`, `limit` (def: 25), `city`, `idpk`, `type`, `from`, `to` |
| `GET` | `/history/:id` | Detalle de una medición por UUID | `id` (UUID en path) |
| `POST` | `/events` | Recepción de eventos desde connector | Payload con `idpk`, `type`, `packageBody` |
| `GET` | `/master1/health` | Acceso directo a réplica 1 | Verificación individual de la instancia 1 |
| `GET` | `/master2/health` | Acceso directo a réplica 2 | Verificación individual de la instancia 2 |

### Ejemplos de uso con `curl`:

```bash
# 1. Consultar historial general
curl "http://energy-shark-2173.duckdns.org/history?limit=10"

# 2. Filtrar por ciudad y rango de fechas
curl "http://energy-shark-2173.duckdns.org/history?city=Hell&from=2026-08-01T00:00:00Z&to=2026-08-30T23:59:59Z"

# 3. Detalle por ID
curl "http://energy-shark-2173.duckdns.org/history/d1f68587-fe4a-4e2b-87fa-4f133ba8f380"

# 4. Probar instancias individuales (Parte Variable)
curl "http://energy-shark-2173.duckdns.org/master1/health"
curl "http://energy-shark-2173.duckdns.org/master2/health"
```

---

## Deploy y Ejecución

### 1. Variables de Entorno (`.env`)
Crear un archivo `.env` en la raíz del proyecto:
```env
AMQP_URL=amqps://<USUARIO>:<PASS>@broker.iic2173.org:5671/energy
QUEUE_NAME=observer.5.q
DATABASE_URL=postgres://energy:<PASS_DB>@<RDS_ENDPOINT>:5432/energyshark
DB_SSL=true
```

### 2. Levantar con Docker Compose
```bash
docker compose up -d --build --scale master=2
```

### 3. Configuración de Nginx en Host
Ubicación: `/etc/nginx/sites-available/energyshark`
```nginx
upstream energyshark_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name energy-shark-2173.duckdns.org;

    location / {
        proxy_pass http://energyshark_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /master1/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
    }

    location /master2/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_set_header Host $host;
    }
}
```
Activar y recargar Nginx:
```bash
sudo ln -sf /etc/nginx/sites-available/energyshark /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

