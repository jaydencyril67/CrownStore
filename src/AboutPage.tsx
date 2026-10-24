import { FileText, Info, ShieldCheck, Store } from "lucide-react";

export default function AboutPage() {
  return <section className="about-page" aria-label="About CrownStore and Terms of Service">
    <header className="about-page-heading">
      <div className="about-page-topline">
        <span className="about-page-eyebrow"><Info size={14} /> ABOUT CROWNSTORE</span>
      </div>
      <h1>About CrownStore</h1>
      <p>One trusted home for discovering apps across the KingsHall ecosystem.</p>
      <p className="about-last-updated">Terms of Service last updated: 24 October 2026</p>
    </header>

    <nav className="about-page-nav" aria-label="About page sections">
      <a href="#about-crownstore">About CrownStore</a>
      <a href="#terms-of-service">Terms of Service</a>
    </nav>

    <section id="about-crownstore" className="about-content-section" aria-labelledby="about-crownstore-title">
      <div className="about-section-heading">
        <span className="about-section-icon"><Store size={20} /></span>
        <div><h2 id="about-crownstore-title">About CrownStore</h2><p>Discover. Review. Keep your apps up to date.</p></div>
      </div>
      <div className="about-body">
        <p>CrownStore is an app discovery and release platform for the KingsHall ecosystem. It brings supported apps together in one place, making it easier to find an app, learn what it does, and check its published release information.</p>
        <p>Depending on the listing, you may find an app description, screenshots, ratings and reviews, version details, publication information, and an official download for a supported release. Availability and details can change as publishers update their listings.</p>
        <ul>
          <li>Discover apps from across the KingsHall ecosystem.</li>
          <li>Review app descriptions, screenshots, versions, and release details.</li>
          <li>Download published releases and check for recent releases in CrownStore.</li>
        </ul>
        <p>Certain account or notification features may require a KingsHall account, a signed-in CrownStore session, device permissions, or a compatible device. Check the permissions and requirements shown on your device before installing an app.</p>
      </div>
    </section>

    <section id="terms-of-service" className="about-content-section" aria-labelledby="terms-of-service-title">
      <div className="about-section-heading">
        <span className="about-section-icon"><FileText size={20} /></span>
        <div><h2 id="terms-of-service-title">Terms of Service</h2><p>The rules for accessing and using CrownStore.</p></div>
      </div>
      <div className="about-terms-list">
        <article className="about-term">
          <h3>1. Accepting these terms</h3>
          <p>By accessing or using CrownStore, you agree to these Terms of Service and applicable laws. Do not use the service if you do not agree to these terms.</p>
        </article>
        <article className="about-term">
          <h3>2. What CrownStore provides</h3>
          <p>CrownStore provides an interface for discovering apps and viewing available listing and release information. Listings, descriptions, screenshots, ratings, versions, and download availability may change or be removed. We aim to keep information useful and accurate, but cannot guarantee that every listing is complete, current, or error-free.</p>
        </article>
        <article className="about-term">
          <h3>3. Downloads, devices, and permissions</h3>
          <p>You are responsible for checking that an app is suitable for your device, reviewing its requested permissions, and understanding the risks of installing software. Use the official download provided for a listing and keep your device and software reasonably protected. App availability and compatibility may vary.</p>
        </article>
        <article className="about-term">
          <h3>4. Accounts and security</h3>
          <p>Some features may require a KingsHall account or a signed-in CrownStore session. Keep your sign-in details and security codes private, use your account responsibly, and notify the appropriate official support channel if you believe your account has been compromised. Never share passwords or one-time security codes in a support message.</p>
        </article>
        <article className="about-term">
          <h3>5. Acceptable use</h3>
          <p>You must not misuse CrownStore, attempt to gain unauthorised access, interfere with its operation, distribute malicious software through the service, abuse its systems, or use it in a way that violates the law or another person's rights.</p>
        </article>
        <article className="about-term">
          <h3>6. Apps and intellectual property</h3>
          <p>CrownStore's name, interface, and original service content belong to their respective rights holders. App names, logos, software, screenshots, and other third-party materials remain the property of their respective owners. An app listing does not transfer ownership or grant you rights beyond those provided by the relevant publisher.</p>
        </article>
        <article className="about-term">
          <h3>7. Third-party apps and services</h3>
          <p>Apps listed in CrownStore may be provided or maintained separately from the store. Their own licence terms, privacy notices, requirements, and support arrangements may apply. Those terms govern your use of the relevant app where applicable; these CrownStore terms do not replace them.</p>
        </article>
        <article className="about-term">
          <h3>8. Availability and disclaimers</h3>
          <p>CrownStore may be updated, changed, temporarily unavailable, or discontinued. To the extent permitted by applicable law, the service is provided on an “as is” and “as available” basis, without a guarantee of uninterrupted operation or that every app will meet your expectations. Nothing in these terms removes a right or protection that cannot legally be excluded.</p>
        </article>
        <article className="about-term">
          <h3>9. Liability</h3>
          <p>To the extent permitted by applicable law, CrownStore is not liable for indirect or consequential losses resulting from your use of, or inability to use, the service. This provision does not exclude or limit liability where applicable law does not allow it to be excluded or limited.</p>
        </article>
        <article className="about-term">
          <h3>10. Changes to the service or these terms</h3>
          <p>Features and these terms may be updated as CrownStore evolves. The date shown at the top indicates when these terms were last updated. If a change affects how you use the service, review the revised terms before continuing to use CrownStore.</p>
        </article>
        <article className="about-term">
          <h3>11. Questions and support</h3>
          <p>For questions about CrownStore, use the official contact or support channel provided through KingsHall. App-specific problems may need to be directed to the publisher of the relevant app.</p>
        </article>
      </div>
    </section>

    <p className="about-page-footer"><ShieldCheck size={16} /> CrownStore is part of the KingsHall ecosystem. App availability and features may vary by release, account status, and device.</p>
  </section>;
}
