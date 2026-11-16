const express = require('express');
const jsonwebtoken = require('jsonwebtoken');
const { expressjwt: jwt } = require('express-jwt');
const winston = require('winston');
const client = require('prom-client');

const SECRET_KEY = 'segredo-edu-api';

// Métricas padrão do Node.js (CPU, memória, event loop...)
client.collectDefaultMetrics();

// Histograma de latência das requisições HTTP
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2.5, 5]
});

// Logger global (Winston)
const { createLogger, format, transports } = winston;

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  transports: [ new transports.Console() ],
});

const app = express();
app.use(express.json());

// Middleware de medição de latência
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const delta = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.path, res.statusCode).observe(delta);
  });
  next();
});

// Rota para gerar o token JWT
app.get('/token', (req, res) => {
  const user = req.query.user || 'guest';
  const role = req.query.role || 'professor';
  const payload = { sub: user, role };
  const token = jsonwebtoken.sign(payload, SECRET_KEY, { expiresIn: '1h' });

  logger.info('Token emitido', { user, role, timestamp: new Date().toISOString() });
  res.json({ token });
});

// Middleware JWT protege tudo que vier depois dele
app.use(
  '/users',
  jwt({ secret: SECRET_KEY, algorithms: ['HS256'] })
);

const users = [
  {
    id: 1,
    name: 'Alice Silva',
    role: 'professora',
    email: 'alice.silva@edulearn.com',
    dateOfBirth: '12/04/1998',
    cpf: '12345678901',
    department: 'Ciência da Computação',
    salary: 'R$ 4.500,00'
  },
  {
    id: 2,
    name: 'Bruno Costa',
    role: 'aluno',
    email: 'bruno.costa@edulearn.com',
    dateOfBirth: '03/09/2001',
    cpf: '98765432100',
    department: 'Engenharia',
    salary: 'R$ 0,00'
  }
];

app.get('/users', (req, res) => {
  logger.info('Acesso a /users', { user: req.auth.sub, role: req.auth.role });
  res.json(users);
});

// Endpoint de métricas para o Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Tratamento de erros de autenticação
app.use((err, req, res, next) => {
  logger.error('Erro de autenticação', { message: err.message, path: req.path });
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(3000, () => {
  console.log('API rodando em http://localhost:3000');
});