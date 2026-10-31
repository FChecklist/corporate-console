// The five places of the console. The same five on the laptop top menu and on the phone bottom bar. Game names are NOT menu items: a game opens from My games or Create.
export const MENU_IDS = ["home", "mygames", "create", "billing", "account"];

/** the menu entries, in order, with the words from copy/en.json */
export const menuItems = (copy) => MENU_IDS.map((id) => ({ id, label: copy.menu[id] }));

/** "#/mygames", "#/view/bingo/AB12" -> ["mygames"], ["view","bingo","AB12"] */
export const partsOf = (hash) => String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);

/** which menu item a route lights up (the Player's screen view belongs to My games) */
export const menuFor = (route) => {
  const first = partsOf("#/" + route)[0] || "home";
  return MENU_IDS.includes(first) ? first : first === "view" || first === "control" ? "mygames" : "home";
};
