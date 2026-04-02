// Prevent old.reddit from reloading the page when navigating back
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    event.stopImmediatePropagation();
  }
}, true);
