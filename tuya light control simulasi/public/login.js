const loginForm = document.querySelector("#loginForm");
const password = document.querySelector("#password");
const loginError = document.querySelector("#loginError");

checkStatus();
loginForm.addEventListener("submit", login);

async function checkStatus() {
  const response = await fetch("/api/auth/status");
  const data = await response.json();
  if (data.authenticated) {
    window.location.href = "/";
  }
}

async function login(event) {
  event.preventDefault();
  loginError.textContent = "";

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password.value })
  });
  const data = await response.json();

  if (!response.ok || data.ok === false) {
    loginError.textContent = data.error || "Login gagal";
    return;
  }

  window.location.href = "/";
}
