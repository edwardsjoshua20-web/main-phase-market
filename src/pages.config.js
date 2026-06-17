/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminInventory from './pages/AdminInventory';
import AdminOrders from './pages/AdminOrders';
import AdvancedDeckBuilder from './pages/AdvancedDeckBuilder';
import Article from './pages/Article';
import CardDetail from './pages/CardDetail';
import Checkout from './pages/Checkout';
import DeckBuilder from './pages/DeckBuilder';
import Dice from './pages/Dice';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Shop from './pages/Shop';
import Success from './pages/Success';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminInventory": AdminInventory,
    "AdminOrders": AdminOrders,
    "AdvancedDeckBuilder": AdvancedDeckBuilder,
    "Article": Article,
    "CardDetail": CardDetail,
    "Checkout": Checkout,
    "DeckBuilder": DeckBuilder,
    "Dice": Dice,
    "Home": Home,
    "ProductDetail": ProductDetail,
    "Shop": Shop,
    "Success": Success,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
