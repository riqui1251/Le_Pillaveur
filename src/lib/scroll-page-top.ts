/** Sur téléphone, c'est body qui défile (globals.css, .is-mobile-device) : window.scrollTo n'y suffit pas. */
export function scrollPageTop() {
  window.scrollTo(0, 0)
  document.body.scrollTo(0, 0)
}
