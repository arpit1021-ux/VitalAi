import dotenv from 'dotenv';
dotenv.config();

import { embedAndStore } from '../services/rag.js';

const knowledgeChunks = [
  // WHO Nutrition Guidelines
  {
    text: 'WHO recommends eating at least 400g of fruits and vegetables per day to reduce the risk of chronic diseases. This includes fresh, frozen, canned, and dried varieties. Aim for a variety of colors to ensure diverse nutrient intake.',
    metadata: { source: 'WHO', category: 'nutrition', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },
  {
    text: 'The World Health Organization advises limiting free sugars to less than 10% of total energy intake, ideally below 5% for additional health benefits. Free sugars include monosaccharides and disaccharides added to foods, plus sugars naturally present in honey, syrups, and fruit juices.',
    metadata: { source: 'WHO', category: 'nutrition', url: 'https://www.who.int/news-room/fact-sheets/detail/sugars-intake-for-adults-and-children' },
  },
  {
    text: 'WHO recommends consuming less than 5g of salt per day to reduce blood pressure and risk of cardiovascular disease. Most salt intake comes from processed foods, not table salt added during cooking.',
    metadata: { source: 'WHO', category: 'nutrition', url: 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction' },
  },
  {
    text: 'The WHO advises replacing saturated fats with unsaturated fats. Saturated fat intake should be less than 10% of total energy, and trans fats should be less than 1%. Sources of healthy fats include olive oil, nuts, seeds, and fatty fish.',
    metadata: { source: 'WHO', category: 'nutrition', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },
  {
    text: 'WHO recommends at least 150 minutes of moderate-intensity aerobic physical activity per week for adults, or 75 minutes of vigorous-intensity activity. Regular physical activity reduces the risk of heart disease, diabetes, and certain cancers.',
    metadata: { source: 'WHO', category: 'fitness', url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity' },
  },

  // FDA Food Additives
  {
    text: 'Red dye No. 40 (Allura Red AC) is a synthetic food dye commonly found in candies, cereals, and beverages. The FDA considers it safe at approved levels, but some studies suggest it may cause hyperactivity in sensitive children. It is banned or restricted in some European countries.',
    metadata: { source: 'FDA', category: 'food-additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Aspartame is an artificial sweetener approved by the FDA. It is 200 times sweeter than sugar and contains negligible calories. In 2023, the IARC classified it as "possibly carcinogenic" (Group 2B), but the FDA maintains it is safe at current consumption levels.',
    metadata: { source: 'FDA', category: 'food-additives', url: 'https://www.fda.gov/food/food-additives-petitions/aspartame' },
  },
  {
    text: 'BHA (butylated hydroxyanisole) and BHT (butylated hydroxytoluene) are synthetic antioxidants used as preservatives in cereals, snack foods, and fats. The FDA classifies BHA as "reasonably anticipated to be a human carcinogen" based on animal studies, though it remains approved for food use.',
    metadata: { source: 'FDA', category: 'food-additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'MSG (monosodium glutamate) is a flavor enhancer that provides the umami taste. The FDA classifies it as "generally recognized as safe" (GRAS). Some people report sensitivity symptoms like headaches, but controlled studies have not consistently confirmed MSG as a cause.',
    metadata: { source: 'FDA', category: 'food-additives', url: 'https://www.fda.gov/food/food-additives-petitions/questions-answers-monosodium-glutamate-msg' },
  },
  {
    text: 'High fructose corn syrup (HFCS) is a liquid sweetener made from corn starch. The FDA considers it safe. However, excessive consumption has been linked to obesity, type 2 diabetes, and fatty liver disease. Limiting added sugars from any source is recommended.',
    metadata: { source: 'FDA', category: 'food-additives', url: 'https://www.fda.gov/food/food-additives-petitions/questions-answers-high-fructose-corn-syrup' },
  },

  // NIH Supplement Facts
  {
    text: 'Vitamin D deficiency is common, especially in northern latitudes. The NIH recommends 600 IU daily for adults 19-70 and 800 IU for those over 70. Vitamin D is essential for calcium absorption, bone health, and immune function. Sources include sunlight, fatty fish, and fortified foods.',
    metadata: { source: 'NIH', category: 'supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
  },
  {
    text: 'Omega-3 fatty acids (EPA and DHA) from fish oil supplements may reduce inflammation and lower risk of heart disease. The NIH recommends 250-500 mg combined EPA and DHA daily for healthy adults. High doses may interact with blood-thinning medications.',
    metadata: { source: 'NIH', category: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/' },
  },
  {
    text: 'Iron supplements should only be taken if deficient, as excess iron can cause constipation, nausea, and may be toxic. The NIH recommends 8 mg/day for men and 18 mg/day for premenopausal women. Take with vitamin C for better absorption, and avoid taking with calcium or antacids.',
    metadata: { source: 'NIH', category: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/' },
  },
  {
    text: 'Probiotics may support digestive health and immune function, though evidence varies by strain. Common beneficial strains include Lactobacillus and Bifidobacterium. The NIH notes that probiotic safety is generally good for healthy individuals, but immunocompromised persons should consult a doctor first.',
    metadata: { source: 'NIH', category: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Probiotics-HealthProfessional/' },
  },
  {
    text: 'Magnesium is involved in over 300 enzymatic reactions in the body. The NIH recommends 310-320 mg/day for women and 400-420 mg/day for men. Deficiency can cause muscle cramps, fatigue, and irregular heartbeat. Good sources include nuts, seeds, whole grains, and leafy greens.',
    metadata: { source: 'NIH', category: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/' },
  },

  // Drug Interaction Data
  {
    text: 'Warfarin (blood thinner) interactions: Avoid vitamin K-rich foods like spinach, kale, and broccoli as they can reduce warfarin effectiveness. Also avoid cranberry juice, grapefruit, and excessive alcohol. Always maintain consistent vitamin K intake when on warfarin.',
    metadata: { source: 'NIH', category: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a682277.html' },
  },
  {
    text: 'Metformin (diabetes medication) may deplete vitamin B12 over time. Regular B12 monitoring is recommended. Avoid excessive alcohol consumption as it increases the risk of lactic acidosis. Take with food to reduce gastrointestinal side effects.',
    metadata: { source: 'NIH', category: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a696005.html' },
  },
  {
    text: 'Statins (cholesterol medications) interact with grapefruit juice, which can increase statin levels in the blood and risk of side effects like muscle pain. Avoid grapefruit or discuss alternatives with your doctor. Also avoid excessive alcohol.',
    metadata: { source: 'NIH', category: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a600045.html' },
  },
  {
    text: 'ACE inhibitors (blood pressure medications) can cause increased potassium levels. Avoid potassium supplements and salt substitutes containing potassium unless directed by your doctor. Monitor kidney function regularly.',
    metadata: { source: 'NIH', category: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a692051.html' },
  },
  {
    text: 'Antibiotics (fluoroquinolones like ciprofloxacin) can interact with dairy products, calcium, iron, and antacids. Take these antibiotics 2 hours before or 6 hours after consuming these products. They may also increase sensitivity to sunlight.',
    metadata: { source: 'NIH', category: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a688016.html' },
  },

  // FSSAI Guidelines (Indian Food Safety)
  {
    text: 'FSSAI recommends checking for the FSSAI license number on packaged food products. The 14-digit number indicates the product has been manufactured in a facility that meets Indian food safety standards. Products without this number may not meet safety standards.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI has banned the use of calcium carbide for artificial ripening of fruits. It recommends using ethylene gas or other safe methods instead. Calcium carbide contains traces of arsenic and phosphorus, which are harmful to health.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI recommends limiting trans fatty acids in partially hydrogenated vegetable oils to less than 2%. Trans fats increase the risk of cardiovascular disease. Check food labels for "partially hydrogenated" oils as ingredients.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI advisory on milk and milk products: Always check the expiry date and storage instructions. Raw milk should be boiled before consumption. Properly stored pasteurized milk has a shelf life of 2-7 days when refrigerated.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI recommends that consumers read nutrition labels carefully. The nutrition information panel shows calories, protein, carbohydrates, fats, sodium, and other nutrients per serving. Compare products to make healthier choices.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI advises against consuming foods with artificial colors, especially in large quantities. Common harmful additives include metanil yellow, rhodamine B, and Sudan dyes. Choose naturally colored foods when possible.',
    metadata: { source: 'FSSAI', category: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
];

async function ingest() {
  console.log(`Starting ingestion of ${knowledgeChunks.length} knowledge chunks...`);

  for (let i = 0; i < knowledgeChunks.length; i++) {
    const chunk = knowledgeChunks[i];
    try {
      await embedAndStore(chunk.text, chunk.metadata);
      console.log(`[${i + 1}/${knowledgeChunks.length}] Ingested: ${chunk.metadata.category} - ${chunk.metadata.source}`);
    } catch (error) {
      console.error(`[${i + 1}/${knowledgeChunks.length}] Failed to ingest chunk:`, error);
    }
  }

  console.log('Ingestion complete!');
}

ingest().catch(console.error);
