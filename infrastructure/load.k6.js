import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '20s', target: 0 },
  ],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] },
};

export function setup() {
  if (!__ENV.SESSION_COOKIE)
    throw new Error(
      'Provide a disposable authenticated SESSION_COOKIE. Run only against an authorized test environment.',
    );
}

export default function () {
  const base = __ENV.BASE_URL || 'http://localhost:3000/api';
  const params = { headers: { Cookie: __ENV.SESSION_COOKIE } };

  for (const path of ['/health', '/templates', '/photobooks?limit=12']) {
    const response = http.get(base + path, params);

    check(response, { success: (r) => r.status === 200 });
    sleep(4);
  }
}
