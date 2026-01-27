import './styles/main.css'

// DOM Elements
const hostBtn = document.getElementById('host-btn') as HTMLButtonElement

// Host button - redirect to host page
hostBtn.addEventListener('click', () => {
  window.location.href = '/host.html'
})
