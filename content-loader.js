/**
 * Content Loader
 * Carga dinámicamente los textos desde archivos JSON
 */

class ContentLoader {
  constructor() {
    this.contentPath = './textos/';
    this.htmlFile = this.detectHtmlFile();
  }

  /**
   * Detecta si estamos en index.html o theivanzheng.html
   * para aplicar variantes específicas (ej: newsletter 500 vs 1000)
   */
  detectHtmlFile() {
    const path = window.location.pathname;
    return path.includes('index.html') ? 'index' : 'theivanzheng';
  }

  /**
   * Carga un archivo JSON
   */
  async loadJSON(filename) {
    try {
      const response = await fetch(`${this.contentPath}${filename}`);
      if (!response.ok) throw new Error(`Error loading ${filename}: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Failed to load ${filename}:`, error);
      return null;
    }
  }

  /**
   * Convierte texto con saltos de línea en HTML preservando
   * párrafos vacíos. Dobles saltos crean párrafos separados.
   */
  textToHtmlPreserveParagraphs(text) {
    if (!text) return '';
    return text
      .split(/\n\s*\n/) // dividir por bloques de párrafo (doble salto o más)
      .map(paragraph => {
        const inner = paragraph
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('<br>');
        return `<p>${inner}</p>`;
      })
      .join('');
  }

  /**
   * Inyecta los textos en el DOM
   */
  async inject() {
    // Cargar todos los JSONs en paralelo
    const [hero, nav, sobreMi, nada, newsletter, proyectos, contacto, footer] = await Promise.all([
      this.loadJSON('hero.json'),
      this.loadJSON('nav.json'),
      this.loadJSON('sobre-mi.json'),
      this.loadJSON('nada.json'),
      this.loadJSON('newsletter.json'),
      this.loadJSON('proyectos.json'),
      this.loadJSON('contacto.json'),
      this.loadJSON('footer.json'),
    ]);

    // Inyectar contenido
    if (hero) this.injectHero(hero);
    if (nav) this.injectNav(nav);
    if (sobreMi) this.injectSobreMi(sobreMi);
    if (nada) this.injectNada(nada);
    if (newsletter) this.injectNewsletter(newsletter);
    if (proyectos) this.injectProyectos(proyectos);
    if (contacto) this.injectContacto(contacto);
    if (footer) this.injectFooter(footer);
  }

  injectHero(data) {
    const h1 = document.querySelector('.hero h1');
    if (h1) h1.textContent = data.title;
  }

  injectNav(data) {
    // Nav center
    const navCenter = document.querySelector('.nav-center');
    if (navCenter) navCenter.textContent = data.center;

    // Nav left
    const navLeft = document.querySelector('.nav-left');
    if (navLeft) {
      navLeft.innerHTML = data.links.left
        .map(link => `<a href="${link.href}">${link.text}</a>`)
        .join('');
    }

    // Nav right
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      navRight.innerHTML = data.links.right
        .map(link => `<a href="${link.href}">${link.text}</a>`)
        .join('');
    }

    // Mobile menu
    const mobileMenu = document.getElementById('nav-mobile-menu');
    if (mobileMenu) {
      mobileMenu.innerHTML = data.mobile_menu
        .map(link => `<a href="${link.href}">${link.text}</a>`)
        .join('');
    }
  }

  injectSobreMi(data) {
    // Título
    const h2 = document.querySelector('.sobre-mi-text h2');
    if (h2) h2.textContent = data.title;

    // Párrafos
    const sobreMiText = document.querySelector('.sobre-mi-text');
    if (sobreMiText) {
      const paragraphsHtml = data.paragraphs
        .map((p, idx) => {
          // Si tiene "Ingeniería Informática", mantén el span con clase playfair-inline
          const hasIngenieria = p.includes('Ingeniería Informática');
          if (hasIngenieria && idx === 0) {
            return `<p>Iván Zheng estudió <span class="playfair-inline">Ingeniería Informática</span> en Salamanca.</p>`;
          }
          return `<p>${p}</p>`;
        })
        .join('');

      // Reemplazar los párrafos existentes
      const existingPs = sobreMiText.querySelectorAll('p');
      const h2El = sobreMiText.querySelector('h2');

      if (existingPs.length > 0 && h2El) {
        // Remover todos los p excepto el h2
        existingPs.forEach(p => p.remove());
        // Insertar nuevos párrafos después del h2
        h2El.insertAdjacentHTML('afterend', paragraphsHtml);
      }
    }
  }

  injectNada(data) {
    // Título
    const h2 = document.querySelector('.nada-text h2');
    if (h2) h2.textContent = data.title;

    // Contenido: preservar párrafos y convertir saltos internos a <br>
    const p = document.querySelector('.nada-text p');
    if (p) {
      p.innerHTML = this.textToHtmlPreserveParagraphs(data.text);
    }
  }

  injectNewsletter(data) {
    // Section label
    const sectionLabel = document.querySelector('.newsletter .section-label');
    if (sectionLabel) sectionLabel.textContent = data.section_label;

    // Título
    const h3 = document.querySelector('.nl-box h3');
    if (h3) h3.textContent = data.title;

    // Descripción - manejar variante de index vs theivanzheng
    const nlDescription = document.querySelector('.nl-box p');
    if (nlDescription) {
      // Si es index.html, reemplazar 500 con 1000
      let description = data.description;
      if (this.htmlFile === 'index') {
        description = description.replace('500', '1000');
      }
      // Preservar párrafos y convertir saltos internos a <br>
      nlDescription.innerHTML = this.textToHtmlPreserveParagraphs(description);
    }

    // Email placeholder
    const emailInput = document.getElementById('newsletter-email');
    if (emailInput) emailInput.placeholder = data.form.email_placeholder;

    // Checkbox label
    const checkboxLabel = document.querySelector('.checkbox-row label');
    if (checkboxLabel) checkboxLabel.textContent = data.form.checkbox_label;

    // Button
    const submitBtn = document.getElementById('newsletter-submit');
    if (submitBtn) submitBtn.textContent = data.form.submit_text;
  }

  injectProyectos(data) {
    // Section label en proyectos-nav
    const proyectosNavLabel = document.querySelector('.projects-nav .section-label');
    if (proyectosNavLabel) proyectosNavLabel.textContent = data.nav_section_label;

    // Projects detail label
    const proyectosDetailLabel = document.querySelector('.proyectos-detail .section-label');
    if (proyectosDetailLabel) proyectosDetailLabel.textContent = data.section_label;

    // Inyectar textos de cada proyecto
    data.projects.forEach(project => {
      const projectItem = document.getElementById(project.id);
      if (projectItem) {
        const h3 = projectItem.querySelector('h3');
        const p = projectItem.querySelector('p');
        if (h3) h3.textContent = project.title;
        if (p) {
          // Preservar párrafos y convertir saltos internos a <br>
          p.innerHTML = this.textToHtmlPreserveParagraphs(project.description);
        }
      }
    });
  }

  injectContacto(data) {
    // Section label
    const sectionLabel = document.querySelector('.trabajemos .section-label');
    if (sectionLabel) sectionLabel.textContent = data.section_label;

    // Título
    const h3 = document.querySelector('.contact-box h3');
    if (h3) h3.textContent = data.title;

    // Inyectar campos del formulario por ID
    const contactEmail = document.getElementById('contact-email');
    const contactSubject = document.getElementById('contact-subject');
    const contactMessage = document.getElementById('contact-message');
    const contactEmailLabel = document.querySelector('label[for="contact-email"]');
    const contactSubjectLabel = document.querySelector('label[for="contact-subject"]');
    const contactMessageLabel = document.querySelector('label[for="contact-message"]');

    if (contactEmailLabel) contactEmailLabel.textContent = data.form.fields[0].label;
    if (contactEmail) contactEmail.placeholder = data.form.fields[0].placeholder;

    if (contactSubjectLabel) contactSubjectLabel.textContent = data.form.fields[1].label;
    if (contactSubject) contactSubject.placeholder = data.form.fields[1].placeholder;

    if (contactMessageLabel) contactMessageLabel.textContent = data.form.fields[2].label;
    if (contactMessage) contactMessage.placeholder = data.form.fields[2].placeholder;

    // Button
    const contactBtn = document.querySelector('.contact-form button');
    if (contactBtn) contactBtn.textContent = data.form.submit_text;
  }

  injectFooter(data) {
    // Copyright
    const copyright = document.querySelector('footer .footer-left');
    if (copyright) copyright.textContent = data.copyright;

    // Mid links
    const midLinks = document.querySelector('footer .footer-mid');
    if (midLinks) {
      midLinks.innerHTML = data.mid_links
        .map(link => `<a href="${link.href}">${link.text}</a>`)
        .join('');
    }

    // Social links
    const socialLinks = document.querySelector('footer .footer-right');
    if (socialLinks) {
      socialLinks.innerHTML = data.social_links
        .map(link => `<a href="${link.href}" target="${link.target || ''}" rel="${link.rel || ''}">${link.text}</a>`)
        .join('');
    }
  }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const loader = new ContentLoader();
    loader.inject();
  });
} else {
  const loader = new ContentLoader();
  loader.inject();
}
