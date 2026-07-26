export const categoryThemes = {
  Networking:{key:"networking",label:"Networking",tagline:"Connected infrastructure engineered for speed and resilience."},
  Energy:{key:"energy",label:"Energy",tagline:"Power, automation and efficiency for demanding operations."},
  "Medical Equipment":{key:"medical",label:"Medical Equipment",tagline:"Clinical technology presented with clarity, safety and trust."},
  Others:{key:"others",label:"Others",tagline:"Industrial sourcing and specialist materials for unique projects."},
} as const;
export type BusinessCategory=keyof typeof categoryThemes;
export function catalogueTheme(category:string|null|undefined){return categoryThemes[(category&&category in categoryThemes?category:"Others") as BusinessCategory];}
