document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Year
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // Scroll Animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(el => observer.observe(el));

    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Mobile Menu Toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenuOverlay = document.createElement('div');
    mobileMenuOverlay.className = 'mobile-menu-overlay';
    mobileMenuOverlay.innerHTML = `
        <div class="mobile-menu">
            <ul class="nav-links">
                <li><a href="#about">About</a></li>
                <li><a href="#experience">Experience</a></li>
                <li><a href="#skills">Skills</a></li>
                <li><a href="#projects">Projects</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
            <a href="#contact" class="btn">Let's Talk</a>
        </div>
    `;
    document.body.appendChild(mobileMenuOverlay);

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuToggle.classList.toggle('active');
            mobileMenuOverlay.classList.toggle('active');
            document.body.style.overflow = mobileMenuOverlay.classList.contains('active') ? 'hidden' : '';
        });
    }

    // Close mobile menu when clicking on a link
    mobileMenuOverlay.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            mobileMenuToggle.classList.remove('active');
            mobileMenuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');

    // Check for saved theme preference or default to dark mode
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);

    // Update icon based on current theme
    updateThemeIcon(currentTheme);

    function updateThemeIcon(theme) {
        themeIcon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            // Add spin animation
            themeToggle.classList.add('spin');
            setTimeout(() => {
                themeToggle.classList.remove('spin');
            }, 500);

            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    // Terminal Hero Typewriter Effect
    const terminalHero = document.querySelector('.terminal-hero');
    if (terminalHero) {
        const originalText = "Hello, I'm Masud Pilot";
        let currentText = "";
        let charIndex = 0;
        let isTyping = true;

        function typeWriter() {
            if (isTyping) {
                if (charIndex < originalText.length) {
                    currentText += originalText.charAt(charIndex);
                    terminalHero.textContent = currentText;
                    charIndex++;
                    setTimeout(typeWriter, 100);
                } else {
                    // Add span back after typing
                    setTimeout(() => {
                        terminalHero.innerHTML = 'Hello, I\'m<span> Masud Pilot</span>';
                        isTyping = false;
                        setTimeout(() => {
                            // Reset and start over
                            charIndex = 0;
                            currentText = "";
                            isTyping = true;
                            typeWriter();
                        }, 3000);
                    }, 2000);
                }
            }
        }

        // Start typewriter effect after page load
        setTimeout(typeWriter, 500);
    }
});
