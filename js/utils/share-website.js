(function () {
  'use strict';

  document.querySelectorAll('.share-website-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = window.location.href.split('#')[0];
      const status = button.parentElement.querySelector('.share-website-status');

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: document.title,
            text: "What's Up on the Front — Что по фронту?",
            url
          });
          status.textContent = 'Thanks for sharing!';
          return;
        } catch (error) {
          if (error.name === 'AbortError') {
            status.textContent = '';
            return;
          }
          console.error('Native website sharing failed; trying to copy the link.', error);
        }
      }

      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard access is unavailable.');
        }
        await navigator.clipboard.writeText(url);
        status.textContent = 'Link copied!';
      } catch (error) {
        console.error('Could not copy the website link.', error);
        const copied = window.prompt('Copy this link to share the website:', url);
        status.textContent = copied === null
          ? 'Copy the website address from your browser to share it.'
          : 'Link ready to share.';
      }
    });
  });
})();
