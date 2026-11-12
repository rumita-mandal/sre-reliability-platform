// Load test with k6 (https://k6.io). Usage:
//   k6 run -e BASE_URL=http://localhost:3000 loadtest/k6.js
// Thresholds mirror the SLOs in docs/SLO.md; k6 exits non-zero if they fail.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const created = http.post(
    `${BASE_URL}/api/items`,
    JSON.stringify({ name: `item-${__VU}-${__ITER}` }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(created, { 'created 201 or limit 429': (r) => r.status === 201 || r.status === 429 });

  const list = http.get(`${BASE_URL}/api/items`);
  check(list, { 'list 200': (r) => r.status === 200 });

  sleep(0.2);
}
