/**
 * Triggers silent background printing using a hidden iframe.
 * When Chrome/Edge is launched with --kiosk-printing flag, the default printer
 * prints the invoice immediately without opening any popup window or confirmation dialog!
 */
export const silentPrintHtml = (htmlContent: string) => {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.id = `silent-print-${Date.now()}`;
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Silent print failed:', err);
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      }
    }, 350);
  } catch (error) {
    console.error('Error initiating silent print:', error);
  }
};
