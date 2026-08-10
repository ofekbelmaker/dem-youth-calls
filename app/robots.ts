import type { MetadataRoute } from "next";

/**
 * חוסם מנועי חיפוש מכל האתר.
 *
 * זה מונע הופעה בגוגל, אבל לא מונע מציאה: יומני שקיפות התעודות
 * חושפים כל דומיין חדש, וסורקים אוטומטיים מגיעים גם בלי אינדוקס.
 * ההגנה האמיתית היא קוד הכניסה — זה רק מוריד את הרעש.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
