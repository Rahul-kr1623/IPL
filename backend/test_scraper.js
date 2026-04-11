import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const { data } = await axios.get('https://www.cricbuzz.com/cricket-match/live-scores', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(data);
    const matches = [];
    $('.cb-mtch-lst.cb-tms-itm').each((i, el) => {
      matches.push($(el).find('.cb-hm-rgion').text().trim());
    });
    console.log("Found matches:", matches);
    
    // Find IPL match
    let pbksMatch = null;
    $('.cb-mtch-lst.cb-tms-itm').each((i, el) => {
      const title = $(el).find('.cb-hm-rgion').text().trim();
      if(title.includes('PBKS') || title.includes('GT') || title.includes('Punjab') || title.includes('Gujarat')) {
        pbksMatch = $(el).html();
      }
    });

    if(pbksMatch) {
       console.log("\n--- FOUND PBKS/GT HTML ---");
       console.log(pbksMatch.substring(0, 500) + "...");
    } else {
       console.log("\nPBKS/GT not found in .cb-mtch-lst.cb-tms-itm");
       // Try generic search
       const allText = $('body').text();
       if(allText.includes('PBKS') || allText.includes('Punjab Kings')) {
          console.log("But PBKS exists on the page!");
       } else {
          console.log("PBKS does not exist anywhere on the page structure accessible to this scraper.");
       }
    }
  } catch (e) {
     console.error(e.message);
  }
}
test();
