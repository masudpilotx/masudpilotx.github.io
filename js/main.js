document.addEventListener("DOMContentLoaded", () => {
  // Dynamic Year
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Smooth Scroll for Anchor Links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      if (targetId && targetId !== "#") {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
          });
        }
      }
    });
  });

  // 3D fighter buddy that roams the page (desktop only).
  // Falls back to the hand-built chibi (nav-buddy.js) if the model can't load.
  // Bump ?v= when you change buddy.js so browsers grab the fresh copy
  import("/js/buddy.js?v=3").catch((err) => {
    console.warn("GLB buddy failed, using built-in chibi:", err);
    import("/js/nav-buddy.js?v=2");
  });
});
