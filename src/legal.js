import './style.css';
// Minimal entry so privacy/terms pages get the shared stylesheet in production builds.
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();
