import sharp from 'sharp';

/**
 * Fetches a logo from a domain or URL and converts it to PNG.
 * @param {string} logoInput - Domain (e.g., 'google.com') or full URL.
 * @param {string} [clientId] - Brandfetch Client ID.
 * @returns {Promise<{ data: string, mimeType: string } | null>}
 */
export async function fetchLogo(logoInput, clientId) {
  let url;
  if (logoInput.startsWith('http://') || logoInput.startsWith('https://')) {
    url = logoInput;
  } else {
    // Assume it's a domain, use Brandfetch API
    url = `https://cdn.brandfetch.io/${logoInput}/type/logo?c=${clientId}`;
  }

  try {
    let response;
    if (!logoInput.startsWith('http')) {
      try {
        let bfError = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            // Try Brandfetch with spoofed headers and manual redirect handling
            response = await fetch(url, {
              headers: {
                'Referer': 'https://brandfetch.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
              },
              redirect: 'manual'
            });

            if (response.status === 200) {
              bfError = null;
              break; // Success!
            } else if (response.status >= 300 && response.status < 400) {
              bfError = new Error(`Brandfetch hotlink block (status ${response.status})`);
              break; // Fatal block, don't retry
            } else {
              bfError = new Error(`Brandfetch failed with status ${response.status}`);
            }
          } catch (e) {
            bfError = e; // Network error like ECONNRESET
          }

          if (attempt < 5) {
            // Exponential backoff to bypass CloudFront TLS reset
            await new Promise(r => setTimeout(r, 200 * attempt));
          }
        }

        if (bfError || !response || !response.ok) {
          throw bfError || new Error("Brandfetch completely failed after 5 attempts");
        }
      } catch (brandfetchError) {
        // Silent catch for Brandfetch errors (WAF blocking, ECONNRESET, etc.) and fallback to icon.horse
        try {
          const fallbackUrl = `https://icon.horse/icon/${logoInput}`;
          response = await fetch(fallbackUrl);
          if (!response.ok) {
            throw new Error(`Fallback icon.horse failed with status ${response.status}`);
          }
        } catch (iconHorseError) {
          // Second fallback to logos.hunter.io if icon.horse fails
          const hunterUrl = `https://logos.hunter.io/${logoInput}`;
          response = await fetch(hunterUrl);
          if (!response.ok) {
            throw new Error(`All fallbacks failed (Brandfetch, icon.horse, logos.hunter.io)`);
          }
        }
      }
    } else {
      response = await fetch(url);
      if (!response.ok) {
        return null;
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to PNG using sharp
    const pngBuffer = await sharp(buffer)
      .png()
      .toBuffer();

    const base64String = pngBuffer.toString('base64');

    return {
      data: base64String,
      mimeType: 'image/png'
    };
  } catch (error) {
    console.error(`Error fetching logo:`, error.message);
    return null;
  }
}
