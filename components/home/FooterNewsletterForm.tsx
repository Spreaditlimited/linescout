'use client';

import { useState } from 'react';

export default function FooterNewsletterForm() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/sureimports-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'linescout_footer_newsletter',
          message_variant: 'site',
          page_type: 'site',
          page_url: window.location.href,
          pathname: window.location.pathname,
          referrer: document.referrer || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Subscription failed.');
      setEmail('');
      setMessage(data.message || 'Subscribed successfully!');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubscribe} className="mb-6">
      <div className="flex gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          aria-label="Email address"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 w-full min-w-0 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 shrink-0 rounded-md bg-brand-orange-500 px-4 text-sm font-medium text-white transition hover:bg-brand-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      <p aria-live="polite" className={message ? 'mt-2 text-xs text-slate-400' : 'sr-only'}>{message}</p>
    </form>
  );
}
