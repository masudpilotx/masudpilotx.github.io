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

  // 3D chibi that hops between nav links (desktop only, loads Three.js from CDN)
  // Bump ?v= when you change nav-buddy.js so browsers grab the fresh copy
  import("/js/nav-buddy.js?v=1").catch((err) =>
    console.warn("Nav buddy failed to load:", err)
  );
});
