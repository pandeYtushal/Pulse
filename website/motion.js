import { animate, inView, scroll, stagger } from 'https://cdn.jsdelivr.net/npm/motion@13.4.6/+esm';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotion) {
  // Only hide reveal targets after Motion has loaded. The page remains complete
  // and readable if the optional animation module is unavailable.
  document.documentElement.classList.add('motion-ready');

  const heroTargets = [
    '.hero-content .eyebrow',
    '.hero-content h1',
    '.hero-content .hero-copy',
    '.hero-content .hero-actions',
    '.hero-content .hero-status',
    '.hero-content .hero-rule',
  ].flatMap(selector => [...document.querySelectorAll(selector)]);

  animate(heroTargets, { opacity: [0, 1], y: [18, 0] }, {
    duration: 0.68,
    delay: stagger(0.075),
    ease: [0.22, 1, 0.36, 1],
  });

  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual) {
    animate(heroVisual, { opacity: [0, 1], y: [14, 0], scale: [0.985, 1] }, {
      duration: 0.9,
      delay: 0.24,
      ease: [0.22, 1, 0.36, 1],
    });
  }

  inView('.motion-item', element => {
    animate(element, { opacity: [0, 1], y: [20, 0] }, {
      duration: 0.62,
      ease: [0.22, 1, 0.36, 1],
    });
  });

  inView('.motion-reveal', element => {
    animate(element, { opacity: [0, 1], y: [22, 0] }, {
      duration: 0.68,
      ease: [0.22, 1, 0.36, 1],
    });
  });

  const progress = document.querySelector('.scroll-progress');
  if (progress) {
    scroll(animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));
  }
}
