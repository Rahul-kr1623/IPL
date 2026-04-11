import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Scrapes IPL points table and cap leaders from Cricbuzz
 * Called once every 30 minutes (not every 40s like the live score)
 */
export const scrapeIPLStandings = async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
    });

    const page = await browser.newPage();

    // ── Points Table ──────────────────────────────────────────────────────
    await page.goto('https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/points-table', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const standingsData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(
        '.cb-srs-pnts tbody tr, .standings-table tr, [class*="points-table"] tr'
      ));

      const table = [];
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length < 4) return;
        
        const teamName = cells[0]?.innerText?.trim();
        const played   = cells[1]?.innerText?.trim();
        const won      = cells[2]?.innerText?.trim();
        const lost     = cells[3]?.innerText?.trim();
        const pts      = cells[cells.length - 2]?.innerText?.trim();
        const nrr      = cells[cells.length - 1]?.innerText?.trim();
        
        if (teamName && pts && !isNaN(parseInt(pts))) {
          table.push({ team: teamName, played, won, lost, pts: parseInt(pts), nrr });
        }
      });

      // Fallback: try a different selector pattern
      if (table.length === 0) {
        const altRows = Array.from(document.querySelectorAll('.cb-col-100 .cb-col'));
        // Try to extract team info from text
        const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];
        const foundTeams = {};
        
        const text = document.body.innerText;
        const lines = text.split('\n').filter(l => l.trim());
        
        lines.forEach(line => {
          IPL_TEAMS.forEach(t => {
            if (line.toUpperCase().includes(t) && !foundTeams[t]) {
              const numMatch = line.match(/(\d+)/g);
              if (numMatch && numMatch.length >= 2) {
                foundTeams[t] = {
                  team: t,
                  pts: parseInt(numMatch[numMatch.length - 2]) || 0,
                  nrr: numMatch[numMatch.length - 1] || '0'
                };
              }
            }
          });
        });
        
        return Object.values(foundTeams).sort((a, b) => b.pts - a.pts);
      }

      return table.sort((a, b) => b.pts - a.pts);
    });

    // ── Orange & Purple Cap ───────────────────────────────────────────────
    // Try the stats page
    let orangeCap = null, purpleCap = null;

    try {
      await page.goto('https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/stats', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await new Promise(r => setTimeout(r, 2000));

      const capsData = await page.evaluate(() => {
        const allText = document.body.innerText;
        
        // Look for top run scorer and wicket taker
        // Page structure varies — try multiple approaches
        
        // Method 1: Find table with "Most Runs" and "Most Wickets"
        const tables = Array.from(document.querySelectorAll('table'));
        let topBatsman = null, topBowler = null;

        for (const table of tables) {
          const heading = table.previousElementSibling?.innerText || table.caption?.innerText || '';
          const firstDataRow = table.querySelector('tbody tr:first-child');
          const cells = firstDataRow ? Array.from(firstDataRow.querySelectorAll('td')) : [];
          
          if (heading.toUpperCase().includes('MOST RUN') || heading.toUpperCase().includes('ORANGE')) {
            const name = cells[1]?.innerText?.trim() || cells[0]?.innerText?.trim();
            const runs = cells.find(c => /^\d{3,}$/.test(c.innerText.trim()))?.innerText?.trim();
            if (name) topBatsman = { name, runs: parseInt(runs) || 0 };
          }
          if (heading.toUpperCase().includes('MOST WICKET') || heading.toUpperCase().includes('PURPLE')) {
            const name = cells[1]?.innerText?.trim() || cells[0]?.innerText?.trim();
            const wkts = cells.find(c => /^\d{1,2}$/.test(c.innerText.trim()))?.innerText?.trim();
            if (name) topBowler = { name, wickets: parseInt(wkts) || 0 };
          }
        }

        return { topBatsman, topBowler };
      });

      orangeCap = capsData.topBatsman;
      purpleCap = capsData.topBowler;

    } catch (e) {
      console.warn('[Standings] Stats page error:', e.message);
      // Fallback to hardcoded placeholder if stats page fails
    }

    await page.close();
    await browser.close();

    return {
      pointsTable: standingsData?.slice(0, 10) || [],
      orangeCap,
      purpleCap,
      lastUpdated: new Date(),
    };

  } catch (err) {
    if (browser) await browser.close();
    console.error('[IPLData] Scrape error:', err.message);
    return null;
  }
};