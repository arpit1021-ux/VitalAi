import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone';
import { embedAndStore } from '../services/rag.js';
import { env } from '../config/env.js';

const knowledgeChunks = [
  // ==================== WHO NUTRITION GUIDELINES ====================
  {
    text: 'WHO recommends eating at least 400g of fruits and vegetables per day to reduce the risk of chronic diseases. This includes fresh, frozen, canned, and dried varieties.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'general-nutrition', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },
  {
    text: 'WHO advises limiting free sugars to less than 10% of total energy intake, ideally below 5%. Free sugars include added sugars plus sugars in honey, syrups, and fruit juices.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'diabetes', url: 'https://www.who.int/news-room/fact-sheets/detail/sugars-intake-for-adults-and-children' },
  },
  {
    text: 'WHO recommends consuming less than 5g of salt per day to reduce blood pressure and cardiovascular disease risk. Most salt comes from processed foods, not table salt.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'hypertension', url: 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction' },
  },
  {
    text: 'WHO advises replacing saturated fats with unsaturated fats. Saturated fat should be less than 10% of total energy, trans fats less than 1%. Healthy sources include olive oil, nuts, seeds, and fatty fish.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'cholesterol', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },
  {
    text: 'WHO recommends at least 150 minutes of moderate-intensity aerobic activity per week for adults, or 75 minutes of vigorous activity. Regular activity reduces heart disease, diabetes, and cancer risk.',
    metadata: { source: 'WHO', category: 'fitness', topic: 'general-nutrition', url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity' },
  },
  {
    text: 'WHO states that a healthy diet includes: fruits, vegetables, legumes, nuts, and whole grains. At least 400g of fruit and vegetables per day. Less than 10% of total energy from free sugars.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'general-nutrition', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },
  {
    text: 'WHO recommends that adults should eat at least 25g of dietary fiber per day. Fiber helps maintain bowel health, lowers cholesterol, and helps control blood sugar levels.',
    metadata: { source: 'WHO', category: 'nutrition', topic: 'diabetes', url: 'https://www.who.int/publications/i/item/healthy-diet' },
  },

  // ==================== DIABETES ====================
  {
    text: 'For diabetes management, WHO recommends limiting added sugars and refined carbohydrates. Choose whole grains over refined grains. Monitor carbohydrate intake and spread it evenly across meals.',
    metadata: { source: 'WHO', category: 'condition', topic: 'diabetes', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes' },
  },
  {
    text: 'People with diabetes should limit white rice, white bread, and sugary drinks. These cause rapid blood sugar spikes. Replace with brown rice, whole wheat, and water or unsweetened beverages.',
    metadata: { source: 'WHO', category: 'condition', topic: 'diabetes', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes' },
  },
  {
    text: 'Diabetic patients should aim for a glycemic index (GI) below 55 for most carbohydrate choices. Low-GI foods include most fruits, non-starchy vegetables, legumes, and whole grains.',
    metadata: { source: 'NIH', category: 'condition', topic: 'diabetes', url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/diet-nutrition' },
  },
  {
    text: 'For type 2 diabetes, weight management is critical. Even a 5-7% body weight loss can significantly improve blood sugar control. Focus on portion control and regular physical activity.',
    metadata: { source: 'NIH', category: 'condition', topic: 'diabetes', url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes/type-2-diabetes' },
  },
  {
    text: 'Foods to avoid with diabetes: sugary beverages, white bread, pastries, breakfast cereals with added sugar, fruit juices, candy, and fried foods. These spike blood glucose rapidly.',
    metadata: { source: 'NIH', category: 'condition', topic: 'diabetes', url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/diet-nutrition' },
  },
  {
    text: 'Diabetes-friendly snack options: nuts, seeds, hummus with vegetables, Greek yogurt, hard-boiled eggs, and cheese with whole-grain crackers. These provide protein and healthy fats without blood sugar spikes.',
    metadata: { source: 'NIH', category: 'condition', topic: 'diabetes', url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/diet-nutrition' },
  },

  // ==================== FATTY LIVER ====================
  {
    text: 'For fatty liver disease, WHO recommends eliminating or strictly limiting alcohol consumption. Even small amounts can worsen liver fat accumulation and inflammation.',
    metadata: { source: 'WHO', category: 'condition', topic: 'fatty-liver', url: 'https://www.who.int/news-room/fact-sheets/detail/hepatitis' },
  },
  {
    text: 'People with fatty liver should avoid fried foods, processed meats, excess saturated fats, and added sugars (especially fructose from syrups). These increase liver fat deposition.',
    metadata: { source: 'NIH', category: 'condition', topic: 'fatty-liver', url: 'https://www.niddk.nih.gov/health-information/liver-disease/nonalcoholic-fatty-liver-disease-nafld-nash' },
  },
  {
    text: 'Fatty liver patients benefit from a Mediterranean-style diet: olive oil, fish, whole grains, fruits, vegetables, and nuts. This diet reduces liver fat and inflammation.',
    metadata: { source: 'NIH', category: 'condition', topic: 'fatty-liver', url: 'https://www.niddk.nih.gov/health-information/liver-disease/nonalcoholic-fatty-liver-disease-nafld-nash' },
  },
  {
    text: 'For fatty liver, limit fructose intake from corn syrup, fruit juices, and sweetened beverages. Fructose is metabolized directly by the liver and promotes fat accumulation.',
    metadata: { source: 'NIH', category: 'condition', topic: 'fatty-liver', url: 'https://www.niddk.nih.gov/health-information/liver-disease/nonalcoholic-fatty-liver-disease-nafld-nash' },
  },
  {
    text: 'Weight loss of 7-10% of body weight over 6-12 months is the most effective treatment for non-alcoholic fatty liver disease. Combine dietary changes with at least 150 minutes of weekly exercise.',
    metadata: { source: 'NIH', category: 'condition', topic: 'fatty-liver', url: 'https://www.niddk.nih.gov/health-information/liver-disease/nonalcoholic-fatty-liver-disease-nafld-nash' },
  },
  {
    text: 'Coffee consumption (2-3 cups daily) may benefit fatty liver patients by reducing liver inflammation and fibrosis. Avoid adding sugar or cream. Herbal teas are also safe alternatives.',
    metadata: { source: 'NIH', category: 'condition', topic: 'fatty-liver', url: 'https://www.niddk.nih.gov/health-information/liver-disease/nonalcoholic-fatty-liver-disease-nafld-nash' },
  },

  // ==================== KIDNEY DISEASE ====================
  {
    text: 'For chronic kidney disease, limit sodium to less than 2,000mg per day. Avoid canned soups, processed meats, frozen dinners, and salty snacks. Use herbs and spices for flavoring instead of salt.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },
  {
    text: 'Kidney disease patients should limit potassium intake to 2,000-3,000mg/day. High-potassium foods to limit: bananas, oranges, potatoes, tomatoes, and spinach. Boiling vegetables reduces potassium.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },
  {
    text: 'For kidney disease, limit phosphorus to 800-1,000mg/day. Avoid processed foods with phosphate additives (look for ingredients containing "phos"). Limit dairy, nuts, and dark colas.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },
  {
    text: 'CKD patients on dialysis need adequate protein (1.0-1.2g/kg/day) to prevent muscle wasting, but should limit protein if not on dialysis (0.6-0.8g/kg/day) to reduce kidney workload.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },
  {
    text: 'Kidney-friendly foods: white bread, white rice, egg whites, lean chicken, fish, cauliflower, bell peppers, and berries (in moderation). These are lower in potassium, phosphorus, and sodium.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },
  {
    text: 'Fluid restriction may be necessary for advanced kidney disease patients, especially those on dialysis. Typically limited to 1-1.5 liters per day. Include fluids from soup, ice cream, and gelatin in the count.',
    metadata: { source: 'NIH', category: 'condition', topic: 'kidney-disease', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/eating-nutrition' },
  },

  // ==================== HIGH CHOLESTEROL ====================
  {
    text: 'For high cholesterol, limit saturated fat to less than 7% of total calories. Avoid fatty meats, full-fat dairy, butter, and tropical oils (coconut, palm). Replace with olive oil and avocado.',
    metadata: { source: 'NIH', category: 'condition', topic: 'cholesterol', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Trans fats raise LDL (bad) cholesterol and lower HDL (good) cholesterol. Avoid foods with partially hydrogenated oils. Check labels on margarine, baked goods, and fried foods.',
    metadata: { source: 'NIH', category: 'condition', topic: 'cholesterol', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Soluble fiber (found in oats, beans, apples, and citrus) can lower LDL cholesterol by 5-10%. Aim for 10-25g of soluble fiber daily from food sources.',
    metadata: { source: 'NIH', category: 'condition', topic: 'cholesterol', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Omega-3 fatty acids from fatty fish (salmon, mackerel, sardines) can lower triglycerides. Eat fish at least twice per week. Plant sources include flaxseeds, chia seeds, and walnuts.',
    metadata: { source: 'NIH', category: 'condition', topic: 'cholesterol', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Plant sterols and stanols (found in fortified foods like certain margarines and orange juice) can reduce LDL cholesterol by 6-15% when consumed at 2g per day.',
    metadata: { source: 'NIH', category: 'condition', topic: 'cholesterol', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },

  // ==================== HYPERTENSION ====================
  {
    text: 'The DASH diet for hypertension: rich in fruits, vegetables, whole grains, and low-fat dairy. Limit sodium to less than 2,300mg/day, ideally 1,500mg/day. Can lower blood pressure by 8-14 mmHg.',
    metadata: { source: 'NIH', category: 'condition', topic: 'hypertension', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'High-sodium foods to avoid with hypertension: soy sauce, table salt, processed cheese, canned vegetables, pickles, olives, chips, and cured meats. Read nutrition labels for sodium content.',
    metadata: { source: 'NIH', category: 'condition', topic: 'hypertension', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Potassium-rich foods help counter sodium effects on blood pressure. Good sources: bananas, sweet potatoes, spinach, beans, and yogurt. However, kidney disease patients should limit potassium.',
    metadata: { source: 'NIH', category: 'condition', topic: 'hypertension', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },
  {
    text: 'Alcohol raises blood pressure. If you drink, limit to 1 drink per day for women and 2 drinks per day for men. One drink equals 12oz beer, 5oz wine, or 1.5oz spirits.',
    metadata: { source: 'WHO', category: 'condition', topic: 'hypertension', url: 'https://www.who.int/news-room/fact-sheets/detail/alcohol' },
  },
  {
    text: 'Caffeine can temporarily raise blood pressure. If you have hypertension, limit coffee to 1-2 cups per day and monitor your response. Decaf or herbal teas are good alternatives.',
    metadata: { source: 'NIH', category: 'condition', topic: 'hypertension', url: 'https://www.nhlbi.nih.gov/education/dash-eating-plan' },
  },

  // ==================== FOOD ADDITIVES ====================
  {
    text: 'MSG (monosodium glutamate, E621) is a flavor enhancer providing umami taste. FDA classifies it as GRAS (generally recognized as safe). Some people report sensitivity symptoms, but controlled studies have not confirmed MSG as a cause.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/questions-answers-monosodium-glutamate-msg' },
  },
  {
    text: 'Disodium inosinate (E631) and disodium guanylate (E627) are flavor enhancers often used with MSG. They are derived from meat or fish extracts. People with gout should avoid them as they increase uric acid levels.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Aspartame (E951) is an artificial sweetener 200x sweeter than sugar. FDA approved it as safe. IARC classified it as "possibly carcinogenic" (Group 2B) in 2023, but FDA maintains safety at approved levels.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/aspartame' },
  },
  {
    text: 'Sucralose (E955) is an artificial sweetener made from sugar. It is 600x sweeter than sugar and heat-stable. FDA approved it as safe. Some studies suggest it may affect gut bacteria at very high doses.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Acesulfame potassium (E950) is a calorie-free sweetener 200x sweeter than sugar. Often blended with other sweeteners. FDA considers it safe. It is not metabolized by the body and is excreted unchanged.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Palm oil is a widely used vegetable oil. It is high in saturated fat (about 50%). While not harmful in moderation, excessive consumption may raise cholesterol. Its production also has significant environmental impact.',
    metadata: { source: 'WHO', category: 'food-additives', topic: 'additives', url: 'https://www.who.int/news-room/fact-sheets/detail/saturated-fatty-acids-and-trans-fatty-acids' },
  },
  {
    text: 'Sodium benzoate (E211) is a preservative used in acidic foods like soft drinks, fruit juices, and pickles. It can form benzene (a carcinogen) when combined with vitamin C (ascorbic acid) under heat or light.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Potassium sorbate (E202) is a common preservative in cheese, yogurt, wine, and baked goods. It prevents mold and yeast growth. Generally recognized as safe at typical usage levels.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Sodium nitrite (E250) is used in cured meats like bacon, ham, and hot dogs. It prevents bacterial growth and gives meat its pink color. In high amounts or when cooked at high heat, it can form cancer-causing nitrosamines.',
    metadata: { source: 'WHO', category: 'food-additives', topic: 'additives', url: 'https://www.who.int/news-room/fact-sheets/detail/processed-meat-and-cancer' },
  },
  {
    text: 'Red dye No. 40 (Allura Red AC, E129) is a synthetic food dye in candies, cereals, and beverages. FDA considers it safe, but some studies suggest it may cause hyperactivity in sensitive children. Banned in some EU countries.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Tartrazine (Yellow 5, E102) is a synthetic dye in soft drinks, cereals, and snacks. It may cause allergic reactions in people sensitive to aspirin. Some studies link it to hyperactivity in children.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Sunset Yellow (Orange Yellow S, E110) is a synthetic dye in snacks, candies, and sauces. Banned in Norway and Finland. May cause allergic reactions and hyperactivity in sensitive individuals.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Brilliant Blue (Blue 1, E133) is a synthetic dye in candies, sports drinks, and ice cream. One of the most widely used food dyes. FDA considers it safe, though some people may be sensitive.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'BHA (butylated hydroxyanisole, E320) and BHT (butylated hydroxytoluene, E321) are synthetic antioxidants in cereals, snack foods, and fats. FDA classifies BHA as "reasonably anticipated to be a human carcinogen."',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'High fructose corn syrup (HFCS) is a liquid sweetener from corn starch. Excessive consumption is linked to obesity, type 2 diabetes, and fatty liver disease. Limiting added sugars from any source is recommended.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/questions-answers-high-fructose-corn-syrup' },
  },
  {
    text: 'Calcium propionate (E282) is a preservative in bread and baked goods to prevent mold. Generally safe, but some children with ADHD may be sensitive to it. Can cause irritability and restlessness in sensitive individuals.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Titanium dioxide (E171) is used as a whitening agent in candies, gum, and sauces. Banned in the EU since 2022 due to concerns about DNA damage. FDA still permits its use in the US.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Propyl gallate (E310) is an antioxidant preservative in fatty foods like meats, butter, and vegetable oils. May cause allergic reactions in sensitive individuals, especially those with aspirin sensitivity.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },
  {
    text: 'Sodium erythorbate (E316) is a preservative and color fixative in processed meats. It is a form of vitamin C and is generally safe. It helps maintain the pink color of cured meats.',
    metadata: { source: 'FDA', category: 'food-additives', topic: 'additives', url: 'https://www.fda.gov/food/food-additives-petitions/food-additive-status-list' },
  },

  // ==================== MAJOR ALLERGENS ====================
  {
    text: 'Gluten is a protein found in wheat, barley, and rye. People with celiac disease or gluten sensitivity must avoid it entirely. Hidden sources include soy sauce, beer, and many processed foods.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/celiac-disease' },
  },
  {
    text: 'Wheat allergy is one of the most common food allergies in children. It is different from gluten intolerance. Avoid wheat-based products, bread, pasta, and cereals. Check for hidden wheat in soy sauce and processed foods.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.foodallergy.org/living-food-allergies/food-allergy-ingredients/wheat' },
  },
  {
    text: 'Dairy allergy is the most common childhood food allergy. Avoid milk, cheese, yogurt, butter, and cream. Hidden dairy sources include baked goods, candy, and processed meats. Lactose intolerance is different from dairy allergy.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Tree nut allergy affects about 1% of the population. Avoid almonds, cashews, walnuts, pecans, pistachios, and Brazil nuts. Cross-reactivity between different tree nuts is common. Always carry an epinephrine auto-injector.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Peanut allergy is one of the most severe food allergies. Even trace amounts can cause anaphylaxis. Avoid peanuts and peanut butter. Check labels carefully as peanuts may be in unexpected foods like chili, salad dressings, and desserts.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Soy allergy is common in infants. Avoid soybeans, tofu, soy milk, soy sauce, and edamame. Soy is hidden in many processed foods, infant formulas, and baked goods. Check ingredient labels carefully.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Egg allergy is common in children but often outgrown. Avoid eggs in all forms including baked goods, pasta, mayonnaise, and meringue. Eggs may be listed as albumin, globulin, lysozyme, or lecithin on labels.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Shellfish allergy affects about 2.5% of adults. Avoid shrimp, crab, lobster, clams, and mussels. Fish allergy is separate from shellfish allergy. Cross-contamination in restaurants is a major risk.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Sesame allergy is increasingly recognized as a major allergen. Avoid sesame seeds, tahini, hummus, and sesame oil. Sesame may appear in bread, Asian dishes, and Middle Eastern foods.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Cross-contamination occurs when allergen-free food comes into contact with allergen-containing food. At restaurants, inform staff about allergies. At home, use separate utensils and cutting boards for allergen-free cooking.',
    metadata: { source: 'NIH', category: 'allergen', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },

  // ==================== SUPPLEMENTS ====================
  {
    text: 'Vitamin D deficiency is common. NIH recommends 600 IU daily for adults 19-70 and 800 IU for those over 70. Essential for calcium absorption, bone health, and immune function. Sources: sunlight, fatty fish, fortified foods.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
  },
  {
    text: 'Omega-3 fatty acids (EPA and DHA) from fish oil may reduce inflammation and heart disease risk. NIH recommends 250-500mg combined EPA+DHA daily. High doses may interact with blood-thinning medications.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/' },
  },
  {
    text: 'Iron supplements should only be taken if deficient. Excess iron causes constipation, nausea, and may be toxic. NIH recommends 8mg/day for men, 18mg/day for premenopausal women. Take with vitamin C, avoid with calcium.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/' },
  },
  {
    text: 'Probiotics may support digestive health. Common strains: Lactobacillus and Bifidobacterium. NIH notes generally safe for healthy people, but immunocompromised individuals should consult a doctor first.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Probiotics-HealthProfessional/' },
  },
  {
    text: 'Magnesium is involved in 300+ enzymatic reactions. NIH recommends 310-320mg/day for women, 400-420mg/day for men. Deficiency causes muscle cramps, fatigue, irregular heartbeat. Sources: nuts, seeds, whole grains, leafy greens.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/' },
  },
  {
    text: 'Calcium is essential for bone health. NIH recommends 1,000mg/day for adults 19-50, 1,200mg/day for women over 50 and men over 70. Best absorbed from food sources like dairy, leafy greens, and fortified foods.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/' },
  },
  {
    text: 'Vitamin B12 is essential for nerve function and red blood cell formation. NIH recommends 2.4mcg/day for adults. Deficiency is common in vegans and older adults. Sources: meat, fish, dairy, eggs, fortified cereals.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/' },
  },
  {
    text: 'Zinc supports immune function and wound healing. NIH recommends 8mg/day for women, 11mg/day for men. Excess zinc can interfere with copper absorption. Sources: meat, shellfish, legumes, seeds, nuts.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/' },
  },
  {
    text: 'Folate (Vitamin B9) is critical during pregnancy to prevent birth defects. NIH recommends 400mcg DFE/day for adults. Found naturally in leafy greens, legumes, and citrus fruits. Synthetic folic acid is in fortified foods.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/' },
  },
  {
    text: 'Vitamin C is an antioxidant that supports immune function and iron absorption. NIH recommends 75mg/day for women, 90mg/day for men. Smokers need 35mg/day more. Sources: citrus fruits, peppers, strawberries, broccoli.',
    metadata: { source: 'NIH', category: 'supplements', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/' },
  },

  // ==================== DRUG INTERACTIONS ====================
  {
    text: 'Warfarin (blood thinner) interactions: Avoid vitamin K-rich foods like spinach, kale, and broccoli as they reduce warfarin effectiveness. Also avoid cranberry juice, grapefruit, and excessive alcohol.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a682277.html' },
  },
  {
    text: 'Metformin (diabetes medication) may deplete vitamin B12 over time. Regular B12 monitoring recommended. Avoid excessive alcohol as it increases lactic acidosis risk. Take with food to reduce GI side effects.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a696005.html' },
  },
  {
    text: 'Statins (cholesterol medications) interact with grapefruit juice, which increases statin blood levels and risk of muscle pain. Avoid grapefruit or discuss alternatives. Also avoid excessive alcohol.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a600045.html' },
  },
  {
    text: 'ACE inhibitors (blood pressure medications) can increase potassium levels. Avoid potassium supplements and salt substitutes with potassium unless directed by your doctor. Monitor kidney function regularly.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a692051.html' },
  },
  {
    text: 'Antibiotics (fluoroquinolones like ciprofloxacin) interact with dairy, calcium, iron, and antacids. Take 2 hours before or 6 hours after consuming these. May increase sunlight sensitivity.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a688016.html' },
  },
  {
    text: 'Thyroid medications (levothyroxine) should be taken on an empty stomach, 30-60 minutes before food. Avoid calcium, iron supplements, soy products, and high-fiber foods within 4 hours of taking the medication.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a682461.html' },
  },
  {
    text: 'Blood pressure medications (beta-blockers) may interact with caffeine, which can reduce their effectiveness. Limit coffee and energy drinks. Also be cautious with licorice root, which can raise blood pressure.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a684031.html' },
  },
  {
    text: 'Diuretics (water pills) can deplete potassium, magnesium, and sodium. Eat potassium-rich foods like bananas and sweet potatoes unless you have kidney disease. Monitor electrolyte levels regularly.',
    metadata: { source: 'NIH', category: 'drug-interactions', topic: 'drug-interactions', url: 'https://medlineplus.gov/druginfo/meds/a684008.html' },
  },

  // ==================== INDIAN FOOD SAFETY (FSSAI) ====================
  {
    text: 'FSSAI recommends checking the 14-digit FSSAI license number on packaged food products. Products without this number may not meet Indian food safety standards.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI has banned calcium carbide for artificial ripening of fruits. It recommends ethylene gas instead. Calcium carbide contains traces of arsenic and phosphorus, which are harmful.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI limits trans fatty acids in partially hydrogenated vegetable oils to less than 2%. Trans fats increase cardiovascular disease risk. Check labels for "partially hydrogenated" oils.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI advisory: Always check expiry dates on milk products. Raw milk should be boiled before consumption. Properly stored pasteurized milk lasts 2-7 days refrigerated.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI recommends reading nutrition labels carefully. The panel shows calories, protein, carbohydrates, fats, sodium, and other nutrients per serving. Compare products to make healthier choices.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI advises against artificial colors in large quantities. Harmful additives include metanil yellow, rhodamine B, and Sudan dyes. Choose naturally colored foods when possible.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI warns about adulteration in common Indian foods: milk (water, detergent), spices (brick powder, lead), honey (sugar syrup), and tea leaves (used tea leaves). Buy from trusted brands.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },
  {
    text: 'FSSAI recommends proper food storage: keep grains in airtight containers, store spices away from heat and light, refrigerate perishables below 4°C, and freeze meat for long-term storage.',
    metadata: { source: 'FSSAI', category: 'food-safety', topic: 'food-safety', url: 'https://www.fssai.gov.in' },
  },

  // ==================== HOME REMEDIES (clearly labeled) ====================
  {
    text: 'Traditional remedy: Ginger tea may help with nausea and digestion. Steep fresh ginger slices in hot water for 5-10 minutes. This is a traditional home remedy, not medical advice. Consult a doctor for persistent symptoms.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/health/ginger' },
  },
  {
    text: 'Traditional remedy: Turmeric with warm milk ("golden milk") is a traditional Indian drink. Curcumin in turmeric has anti-inflammatory properties. Add a pinch of black pepper to improve absorption. This is a traditional remedy, not medical advice.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/health/turmeric' },
  },
  {
    text: 'Traditional remedy: Honey and lemon in warm water is a common folk remedy for sore throats and colds. Honey has mild antimicrobial properties. Do not give honey to children under 1 year due to botulism risk. This is a traditional remedy, not medical advice.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/health/honey' },
  },
  {
    text: 'Traditional remedy: Tulsi (holy basil) tea is traditionally used in Ayurveda for respiratory health and stress. Some studies suggest adaptogenic properties. This is a traditional home remedy, not medical advice.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/' },
  },
  {
    text: 'Traditional remedy: Jeera (cumin) water is traditionally used for digestive issues in Indian households. Boil cumin seeds in water and drink warm. This is a traditional home remedy, not medical advice. Consult a doctor for persistent digestive problems.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/' },
  },
  {
    text: 'Traditional remedy: Amla (Indian gooseberry) is rich in vitamin C and traditionally used for immunity and digestion. Can be consumed raw, as juice, or in pickle form. This is a traditional home remedy, not medical advice.',
    metadata: { source: 'NIH', category: 'home-remedy', topic: 'home-remedies', url: 'https://www.nccih.nih.gov/' },
  },

  // ==================== FOOD LABELS ====================
  {
    text: 'When reading food labels, check the serving size first. All nutrition information is per serving, not per package. A package may contain multiple servings even if it looks like a single portion.',
    metadata: { source: 'FDA', category: 'food-labels', topic: 'food-labels', url: 'https://www.fda.gov/food/nutrition-education-resources-materials/how-understand-and-use-nutrition-facts-label' },
  },
  {
    text: '"Added sugars" on nutrition labels means sugars added during processing, not naturally occurring sugars in fruit or milk. The % Daily Value helps you determine if a food is high or low in added sugars (5% or less is low, 20% or more is high).',
    metadata: { source: 'FDA', category: 'food-labels', topic: 'food-labels', url: 'https://www.fda.gov/food/nutrition-education-resources-materials/how-understand-and-use-nutrition-facts-label' },
  },
  {
    text: 'The ingredients list is in descending order by weight. If sugar or an unhealthy ingredient is listed first or second, the product contains a significant amount of it, regardless of marketing claims.',
    metadata: { source: 'FDA', category: 'food-labels', topic: 'food-labels', url: 'https://www.fda.gov/food/nutrition-education-resources-materials/how-understand-and-use-nutrition-facts-label' },
  },
  {
    text: 'Common hidden names for added sugars on food labels: dextrose, maltose, sucrose, high fructose corn syrup, cane juice, barley malt, rice syrup, and agave nectar. Any ingredient ending in "-ose" is a sugar.',
    metadata: { source: 'FDA', category: 'food-labels', topic: 'food-labels', url: 'https://www.fda.gov/food/nutrition-education-resources-materials/how-understand-and-use-nutrition-facts-label' },
  },
  {
    text: 'Sodium content on food labels: 140mg or less per serving is considered "low sodium." 400mg or more per serving is considered "high." Most adults should aim for less than 2,300mg of sodium per day.',
    metadata: { source: 'FDA', category: 'food-labels', topic: 'food-labels', url: 'https://www.fda.gov/food/nutrition-education-resources-materials/how-understand-and-use-nutrition-facts-label' },
  },

  // ==================== PROCESSED MEAT & CANCER ====================
  {
    text: 'WHO classifies processed meat as a Group 1 carcinogen (causes cancer). Eating 50g of processed meat daily (about 2 slices of bacon) increases colorectal cancer risk by 18%. Limit consumption.',
    metadata: { source: 'WHO', category: 'cancer-risk', topic: 'additives', url: 'https://www.who.int/news-room/fact-sheets/detail/processed-meat-and-cancer' },
  },
  {
    text: 'Red meat is classified as Group 2A (probably carcinogenic). WHO recommends limiting red meat to less than 500g (cooked weight) per week. Choose poultry, fish, or plant proteins more often.',
    metadata: { source: 'WHO', category: 'cancer-risk', topic: 'general-nutrition', url: 'https://www.who.int/news-room/fact-sheets/detail/cancer' },
  },
  {
    text: 'Nitrates and nitrites in processed meats can form nitrosamines, which are cancer-causing compounds. Vitamin C (ascorbic acid) added to processed meats can reduce nitrosamine formation.',
    metadata: { source: 'WHO', category: 'cancer-risk', topic: 'additives', url: 'https://www.who.int/news-room/fact-sheets/detail/processed-meat-and-cancer' },
  },

  // ==================== PREGNANCY NUTRITION ====================
  {
    text: 'During pregnancy, avoid raw or undercooked meat, eggs, and fish (especially high-mercury fish like shark, swordfish, king mackerel). Limit caffeine to 200mg/day. Avoid alcohol entirely.',
    metadata: { source: 'WHO', category: 'pregnancy', topic: 'pregnancy', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
  },
  {
    text: 'Pregnant women need additional folate (600mcg/day), iron (27mg/day), and calcium (1,000mg/day). Prenatal vitamins help meet these needs. Eat plenty of leafy greens, lean proteins, and dairy.',
    metadata: { source: 'NIH', category: 'pregnancy', topic: 'pregnancy', url: 'https://ods.od.nih.gov/factsheets/Pregnancy-HealthProfessional/' },
  },
  {
    text: 'Pregnant women should avoid: raw sprouts, unpasteurized milk and cheeses, deli meats (unless heated), high-mercury fish, and excessive vitamin A (retinol) supplements, which can cause birth defects.',
    metadata: { source: 'NIH', category: 'pregnancy', topic: 'pregnancy', url: 'https://ods.od.nih.gov/factsheets/Pregnancy-HealthProfessional/' },
  },

  // ==================== CHILDREN NUTRITION ====================
  {
    text: 'Children under 2 years should not have any added sugars. Children 2-18 should limit added sugars to less than 25g (6 teaspoons) per day. Avoid sugary drinks, which are the leading source of added sugars in children.',
    metadata: { source: 'WHO', category: 'children', topic: 'children', url: 'https://www.who.int/news-room/fact-sheets/detail/sugars-intake-for-adults-and-children' },
  },
  {
    text: 'Common allergens in children: milk, eggs, peanuts, tree nuts, wheat, soy, fish, and shellfish. Introduce allergens early (around 6 months) to reduce allergy risk. Always consult a pediatrician.',
    metadata: { source: 'NIH', category: 'children', topic: 'allergens', url: 'https://www.niaid.nih.gov/diseases-conditions/food-allergy' },
  },
  {
    text: 'Children need adequate calcium for bone growth: 700mg/day for ages 1-3, 1,000mg/day for ages 4-8, and 1,300mg/day for ages 9-18. Good sources: milk, yogurt, cheese, fortified cereals, and leafy greens.',
    metadata: { source: 'NIH', category: 'children', topic: 'supplements', url: 'https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/' },
  },
];

async function ingest() {
  console.log(`Starting ingestion of ${knowledgeChunks.length} knowledge chunks...`);

  const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  const index = pinecone.index(env.PINECONE_INDEX_NAME);

  console.log('Clearing existing vectors for clean re-ingest...');
  try {
    await index.deleteAll();
    console.log('Existing vectors deleted.');
  } catch (err: any) {
    console.warn('Could not delete existing vectors (may be empty):', err.message);
  }

  for (let i = 0; i < knowledgeChunks.length; i++) {
    const chunk = knowledgeChunks[i];
    try {
      await embedAndStore(chunk.text, chunk.metadata);
      console.log(`[${i + 1}/${knowledgeChunks.length}] Ingested: ${chunk.metadata.topic} (${chunk.metadata.source})`);
    } catch (error) {
      console.error(`[${i + 1}/${knowledgeChunks.length}] Failed to ingest chunk:`, error);
    }
  }

  console.log(`\nIngestion complete! ${knowledgeChunks.length} chunks ingested.`);
}

ingest().catch(console.error);
