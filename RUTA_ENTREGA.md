# Ruta de trabajo — Entrega 0 EnergyShark (IIC2173 2026-2)

Fecha de entrega: 30/ago/2026

## Decisiones de stack

| Componente | Tecnología |
|---|---|
| Servicio web (master) | Node.js + NestJS |
| Connector (broker) | Node.js/TypeScript + `amqplib` |
| Base de datos | AWS RDS Postgres |
| Parte variable | Balanceo de Carga con Nginx |
| Orquestación | Docker Compose |
| Infraestructura | AWS EC2 free tier (t2.micro) |

## Arquitectura objetivo

```
RabbitMQ (broker.iic2173.org:5671)
   └─ cola observer.X.q ──► connector (container) ──HTTP POST──► master x2 (containers, puertos 3001/3002)
                                                                    │  │
Nginx en el host EC2 (upstream 127.0.0.1:3001 + 3002) ◄─────────────┘  │
        └─ dominio público (A record → EIP)                            ▼
                                                              RDS Postgres (externa)
```

## Hito 1 — Master (NestJS) local

- Scaffold de NestJS + TypeORM.
- Modelo de datos (una fila por entrada de `demands[]`, facilita RF4):
  `id` (UUID generado por nosotros, PK), `idpk`, `type`, `city`, `demand`, `unit`, `validUntil`, `metaContent`, `constraints` (JSONB), `receivedAt` (ISO8601 UTC).
- Endpoints:
  - `POST /events` — recibe el evento del connector, valida schema, dedupe por `idpk`, setea `receivedAt`.
  - `GET /history` — paginado default `limit=25` (`page`, `limit`), filtros por cada propiedad incl. `receivedAt` (rango/día), `city`, `idpk`, `type`.
  - `GET /history/:id` — detalle de un registro (RF2).
  - `GET /health` — para HEALTHCHECK.
- Postgres local (container) para dev.

Comandos clave:

```bash
# Scaffold del proyecto NestJS
npx @nestjs/cli new master
cd master && npm i @nestjs/typeorm typeorm pg class-validator class-transformer

# Postgres local para dev
docker run -d --name pg-dev -e POSTGRES_USER=energy -e POSTGRES_PASSWORD=energy \
  -e POSTGRES_DB=energyshark -p 5432:5432 postgres:16

# Migraciones / sincronización de esquema
npm run build
# Levantar en modo dev
npm run start:dev
```

## Hito 2 — Connector

- `amqplib`, conexión `amqps://...@broker.iic2173.org:5671` (puerto 5671 = AMQPS/TLS, requiere socket SSL).
- Cola `observer.X.q`; consumir, parsear JSON, validar contra schema, `POST` a master.
- Reconexión automática: handlers `close`/`error` con backoff exponencial, nunca terminar el proceso; `nack`/re-queue en errores (RNF1).

Comandos clave:

```bash
# Proyecto del connector
npx @nestjs/cli new connector
cd connector && npm i amqplib dotenv

# Prueba de concepto: conexión al broker (puerto 5671 = AMQPS/TLS)
node -e "
const amqp = require('amqplib');
amqp.connect('amqps://USUARIO:PASS@broker.iic2173.org:5671').then(c => {
  console.log('conectado'); return c.close();
}).catch(e => console.error(e));
"

# Consumir manualmente la cola para inspeccionar mensajes
# (dentro del consumer) rabbitmqctl no aplica; usar console.log del body.
npm run start:dev
```

## Hito 3 — Docker + Compose

- `Dockerfile` master y connector, ambos con HEALTHCHECK basado en `curl` (RNF7): master → `/health`; connector → curl al `/health` de master (permitido).
- `docker-compose.yml`: servicios `master` (escalable con `--scale master=2`, publicando 3001/3002), `connector`, y un `db` Postgres para dev.
- Nota (RNF2-compose): con RDS la DB no vive en compose. `DATABASE_URL` inyectado vía env en compose apuntando a RDS en producción; `db` en compose solo para dev local.

Comandos clave:

```bash
# Build de imágenes
docker build -t energy-master ./master
docker build -t energy-connector ./connector

# Subir/levantar stack local
docker compose up -d --build
docker compose ps                    # ver HEALTHCHECK (RNF7)

# Escalar master (variable: LB)
docker compose up -d --scale master=2

# Ver logs y health
docker compose logs -f connector
docker inspect --format '{{.State.Health.Status}}' energy-master-1
```

## Hito 4 — AWS (EC2 + RDS + DNS)

- EC2 free tier (t2.micro), Elastic IP (EIP) para que el A-record sobreviva reinicios, SG abriendo 22/80/443.
- RDS Postgres (db.t3.micro, 20GB free tier), SG restringido solo al SG del EC2.
- Instalar Docker + Nginx en el host (Nginx no en container — RNF3).
- Dominio bajo TLD público (Namecheap/Student Pack), A record → EIP (RNF4).

Comandos clave:

```bash
# EC2 free tier (t2.micro): lanzar vía consola o AWS CLI, SG abrir 22/80/443
aws ec2 run-instances --image-id ami-xxxx --instance-type t2.micro \
  --key-name tu-key --security-group-ids sg-xxxx --subnet-id subnet-xxxx
aws ec2 allocate-address          # Elastic IP (EIP)
aws ec2 associate-address --instance-id i-xxxx --allocation-id eipalloc-xxxx

# SSH a la instancia
chmod 400 ~/.ssh/tu-key.pem
ssh -i ~/.ssh/tu-key.pem ubuntu@<IP_DEL_EC2>

# En el EC2: instalar Docker, compose y Nginx (host, fuera de containers)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx
sudo usermod -aG docker $USER && newgrp docker

# RDS: consola → Create database → PostgreSQL → db.t3.micro → SG solo al SG del EC2
# Guardar endpoint, dbname, usuario y password en el DATABASE_URL del master
psql "postgresql://energy:PASS@<rds-endpoint>:5432/energyshark" -c "select 1;"

# DNS: en el registrador, crear A record → EIP del EC2 (ej. energy.tu-dominio.me)
dig energy.tu-dominio.me +short     # verificar resolución
```

## Hito 5 — Deployment + Nginx LB

- Subir repo a EC2, build, `docker compose up --scale master=2`.
- Nginx host: `upstream { server 127.0.0.1:3001; server 127.0.0.1:3002; }` + `proxy_pass` (RNF3 + RF1/RF2 variable). Commitear la config de Nginx en el repo.
- Verificar `/history` vía dominio.

Comandos clave:

```bash
# En el EC2: clonar y desplegar
git clone git@github.com:TU_USER/repo-e0.git && cd repo-e0
docker compose up -d --build --scale master=2

# Probar cada instancia individualmente (RF2 variable)
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3002/health

# Nginx host: /etc/nginx/sites-available/energyshark
#   upstream masters { server 127.0.0.1:3001; server 127.0.0.1:3002; }
#   server { listen 80; server_name energy.tu-dominio.me;
#            location / { proxy_pass http://masters; proxy_set_header Host $host; } }
sudo ln -s /etc/nginx/sites-available/energyshark /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Verificar por dominio
curl -s "http://energy.tu-dominio.me/history?limit=25"
```

## Hito 6 — Robustez + entrega

- Test: cortar RabbitMQ → connector se reconecta solo; master sigue sirviendo datos históricos (RNF1).
- `README.md` (dominio, acceso SSH con .pem sin publicarlo, puntos logrados/no logrados).
- Canvas: buzón con archivo `.pem` + info de conexión (nunca en el repo).
- Registrar toda interacción AI en `ai-docs/prompts` (incluyendo esta sesión).

Comandos clave:

```bash
# Test RNF1: cortar broker → connector debe reconectarse solo; master sigue sirviendo
sudo systemctl stop nginx   # (o bloquear puerto 5671) y observar logs
docker compose logs -f connector   # debe mostrar reconnect con backoff, no exit
curl -s http://energy.tu-dominio.me/history?limit=25   # sigue respondiendo datos viejos

# Datos de prueba del schema (POST manual al master para validar sin broker)
curl -s -X POST http://127.0.0.1:3001/events -H 'Content-Type: application/json' -d '{
  "idpk": "<uuid>", "type": "demand-set",
  "packageBody": { "demands": [ {"city": "Los Santos", "demand": 10223, "unit": "GW"} ],
                   "validUntil": "2026-12-12T00:00:00Z" }
}'
```

## Requisitos a cumplir (checklist)

### Parte mínima
- [ ] RF1: lista del historial de demanda (3p, esencial)
- [ ] RF2: detalle por `{url}/history/{:id}` (1p)
- [ ] RF3: paginación default 25 con `page`/`limit` (2p, esencial)
- [ ] RF4: filtros por cada propiedad incl. tiempo (4p, esencial)
- [ ] RNF1: connector AMQP + reconexión automática + POST a master (5p, esencial)
- [ ] RNF2: despliegue containerizado, master + connector en misma red docker (4p, esencial)
- [ ] RNF3: proxy inverso Nginx en el host EC2 (3p)
- [ ] RNF4: dominio bajo TLD público (2p)
- [ ] RNF5: EC2 free tier (2p, esencial)
- [ ] RNF6: DB Postgres/Mongo externa — RDS (2p)
- [ ] RNF7: HEALTHCHECK en todos los containers (2p, esencial)
- [ ] Docker Compose: master desde compose (5p), DB integrada (5p), connector + conexión (5p)

### Parte variable — Balanceo de Carga con Nginx
- [ ] RF1: master replicado en ≥2 containers (5p)
- [ ] RF2: cada instancia alcanzable individualmente desde Nginx host (10p)

## Prerequisitos

- Credenciales del observer (llegan por Canvas): cola `observer.X.q`, usuario/contraseña.
- Dominio público registrado.
- Cuenta AWS con free tier habilitado.