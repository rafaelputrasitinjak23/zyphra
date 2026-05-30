document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-menu-btn]');
  if (!btn) return;
  const menu = document.querySelector('[data-mobile-menu]');
  if (menu) menu.classList.toggle('hidden');
});

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

function attachCsrfToForms() {
  if (!csrfToken) return;
  document.querySelectorAll('form[method="post"], form[method="POST"]').forEach((form) => {
    if (form.querySelector('input[name="_csrf"]')) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = '_csrf';
    input.value = csrfToken;
    form.appendChild(input);
  });
}

function attachClientGuard() {
  const enabled = document.querySelector('meta[name="client-guard"]')?.content === '1';
  if (!enabled) return;
  const block = (event) => {
    event.preventDefault();
    return false;
  };
  document.addEventListener('contextmenu', block);
  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const blocked = event.key === 'F12'
      || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))
      || (event.ctrlKey && ['u', 's'].includes(key));
    if (blocked) block(event);
  });
}

attachCsrfToForms();
attachClientGuard();
