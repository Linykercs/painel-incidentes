// Cliente mínimo da API do ClickUp: busca todos os cards de uma lista, com paginação e retry.

const BASE = 'https://api.clickup.com/api/v2';
const MAX_RETRIES = 3;

async function request(path, token, attempt = 1) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    if (attempt < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return request(path, token, attempt + 1);
    }
    const body = await res.text();
    throw new Error(`ClickUp ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchListTasks(listId, token) {
  const tasks = [];
  let page = 0;
  for (;;) {
    const data = await request(
      `/list/${listId}/task?include_closed=true&subtasks=false&page=${page}`,
      token
    );
    tasks.push(...(data.tasks || []));
    if (data.last_page || (data.tasks || []).length === 0) break;
    page += 1;
  }
  return tasks;
}
