'use client';

import { useState } from 'react';


import styles from './FooterNewsletterForm.module.css';

export default function FooterNewsletterForm() {
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setFeedback('');
    try {
      const response = await fetch('/api/sureimports-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'footer_newsletter',
          message_variant: 'site',
          page_type: 'site',
          page_url: typeof window !== 'undefined' ? window.location.href : null,
          pathname:
            typeof window !== 'undefined' ? window.location.pathname : null,
          referrer:
            typeof document !== 'undefined' ? document.referrer || null : null,
          segment_ids: ['67699403ee348d7f8cb68f3a'],
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setFeedback(data.message || 'Subscribed successfully!');
        setEmail('');
      } else {
        setFeedback(data.error || 'Subscription failed.');
      }
    } catch {
      setFeedback('Unable to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
    <form onSubmit={handleSubscribe} className={styles.form}>
      <input
        type="email"
        required
        autoComplete="email"
        aria-label="Email address"
        placeholder="Email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={styles.input}
      />
      <button type="submit" disabled={isSubmitting} className={styles.button}>
        {isSubmitting ? 'Subscribing…' : 'Subscribe'}
      </button>
    </form>
    <p role="status" aria-live="polite" style={{fontSize: 14, lineHeight: 1.5}}>{feedback}</p>
    </div>
  );
}
