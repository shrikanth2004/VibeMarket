/**
 * Lightweight UI enhancements — header scroll, dark mode label
 */
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const darkToggle = document.getElementById('dark-mode-toggle');
  if (darkToggle) {
    const updateLabel = () => {
      const isDark = document.body.classList.contains('dark-mode');
      darkToggle.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    };
    updateLabel();
    darkToggle.addEventListener('click', () => {
      setTimeout(updateLabel, 0);
    });
  }
});
