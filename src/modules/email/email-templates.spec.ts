import { emailVerificationEmail, passwordResetEmail, welcomeEmail } from './email-templates';

describe('email template branding', () => {
  it('uses SD Shop in the welcome email subject, content, and footer', () => {
    const email = welcomeEmail({ firstName: 'Journey', code: '123456' });

    expect(email.subject).toBe('Welcome to SD Shop');
    expect(email.html).toContain('Welcome to SD Shop, Journey');
    expect(email.html).toContain('alt="SD Shop"');
    expect(email.html).toContain('SD Shop Ltd');
    expect(email.html).not.toContain('UK Shop');
  });

  it('uses the storefront navy, blue, and cyan palette throughout the shared email shell', () => {
    const html = welcomeEmail({ firstName: 'Journey', code: '123456' }).html;

    expect(html).toContain('background:#05080d');
    expect(html).toContain('background:#0a111b');
    expect(html).toContain('background:#087ff5');
    expect(html).toContain('color:#39c7ff');
    expect(html).not.toContain('#e0201f');
  });

  it('uses SD Shop in verification and password-reset copy', () => {
    expect(emailVerificationEmail({ code: '123456' }).html).toContain('Didn&rsquo;t sign up for SD Shop?');
    expect(passwordResetEmail({ code: '123456' }).html).toContain('reset your SD Shop password');
  });
});
