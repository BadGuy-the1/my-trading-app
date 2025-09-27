async function postJSON(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({
      'Content-Type': 'application/json'
    }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body)
  });
  return res.json();
}

document.getElementById('btnRegister').onclick = async () => {
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPass').value;
  const r = await postJSON('/api/register', { email, password });
  alert(JSON.stringify(r));
};

document.getElementById('btnLogin').onclick = async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPass').value;
  const r = await postJSON('/api/login', { email, password });
  if (r.ok) {
    localStorage.setItem('token', r.token);
    alert('Logged in!');
  } else alert(JSON.stringify(r));
};

document.getElementById('btnSaveKeys').onclick = async () => {
  const alpacaKey = document.getElementById('alpacaKey').value;
  const alpacaSecret = document.getElementById('alpacaSecret').value;
  const token = localStorage.getItem('token');
  const r = await postJSON('/api/keys/save', { alpacaKey, alpacaSecret }, token);
  alert(JSON.stringify(r));
};
