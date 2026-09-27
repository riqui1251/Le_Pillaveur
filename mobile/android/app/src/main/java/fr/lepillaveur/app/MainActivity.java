package fr.lepillaveur.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebBackForwardList;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.WebViewListener;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.Map;
import org.json.JSONObject;

/**
 * Coquille Android de lepillaveur.fr. Capacitor charge le site dans une WebView
 * (server.url) ; cette activité rend ce que BridgeActivity ne fait pas et qu'un
 * navigateur fait : retour dans l'historique, liens entrants, page retrouvée après une
 * recréation, cookies écrits à temps, survie à la mort du renderer. Elle ferme aussi les
 * accès natifs du serveur local de Capacitor, dont le site n'a pas besoin.
 */
public class MainActivity extends BridgeActivity {

    /** Seul hôte que l'app accepte de charger depuis un lien reçu : elle n'affiche que le site. */
    private static final String HOTE_DU_SITE = "lepillaveur.fr";

    /**
     * Préfixe des chemins spéciaux du serveur local de Capacitor : /_capacitor_file_
     * (n'importe quel fichier privé de l'app), /_capacitor_content_ (content://) et
     * /_capacitor_http_interceptor_ (requêtes natives sans CORS). En mode server.url ils
     * répondent sur lepillaveur.fr même, donc en même origine que le site. Le site n'en
     * utilise aucun ; ouverts, ils livreraient à une XSS la base de cookies de la WebView
     * (lp_session, pourtant HttpOnly) et les jetons du plugin Google.
     */
    private static final String PREFIXE_CAPACITOR = "/_capacitor_";

    /** Clé de l'état sauvegardé : la page du site où était le joueur. */
    private static final String ETAT_PAGE = "fr.lepillaveur.app.PAGE";

    /** Deux morts du renderer à moins de 30 s l'une de l'autre forment une rafale. */
    private static final long DELAI_BOUCLE_RENDU_MS = 30_000;

    /** Statiques : survivent au recreate() qui suit une mort du renderer (même processus). */
    private static long derniereMortDuRendu = -DELAI_BOUCLE_RENDU_MS;

    private static int mortsEnRafale = 0;

    /** Dernière URL du cadre principal en panne (réseau, 502/503/504…), qui a mené à l'écran d'erreur. */
    private String urlEnEchec;

    /** Instance recréée par le système : processus tué en arrière-plan, recreate(), configuration. */
    private boolean restauration;

    /** Page lue dans l'état sauvegardé, à rouvrir à la restauration (null : l'accueil). */
    private String pageRestauree;

    /** Vrai pendant BridgeActivity.load(), qui passe l'intent de LANCEMENT à onNewIntent. */
    private boolean auLancement;

    /** WebView détruite après la mort du renderer, en attendant le recreate(). */
    private boolean vueMorte;

    /** Page que le recreate() suivant la mort du renderer doit rouvrir (null : l'accueil). */
    private String pageApresMortDuRendu;

    /** Renderer mort app en arrière-plan : le recreate() attend le retour au premier plan. */
    private boolean aRecreerAuRetour;

    private final OnBackPressedCallback retour = new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
            reculer();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Lu AVANT super.onCreate : c'est lui qui charge la première page (load() → onNewIntent).
        restauration = savedInstanceState != null;
        pageRestauree = restauration ? savedInstanceState.getString(ETAT_PAGE) : null;
        super.onCreate(savedInstanceState);
        // Retour (bouton et geste) : Capacitor ne le gère pas, il sortait de l'app au lieu de
        // remonter l'historique. Callback AndroidX : c'est la seule voie avec le retour
        // prédictif d'Android 16, où onBackPressed n'est plus appelé.
        getOnBackPressedDispatcher().addCallback(this, retour);

        if (bridge == null) {
            return; // WebView absente de l'appareil : Capacitor affiche son écran no_webview
        }
        // Posés après le premier loadUrl, mais avant tout rappel de chargement : la WebView
        // les appelle plus tard, sur ce même fil, une fois onCreate terminé.
        bridge.setWebViewClient(new ClientDuSite(bridge));
        bridge.addWebViewListener(new SurvieDuRendu());
    }

    @Override
    protected void load() {
        auLancement = true;
        try {
            super.load();
        } finally {
            auLancement = false;
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (aRecreerAuRetour) {
            aRecreerAuRetour = false;
            recreate();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Chromium écrit les cookies sur disque par lots différés, et ni Capacitor ni la
        // WebView ne forcent l'écriture ici : un cookie tout juste posé (session, portail
        // 18+) se perdait si le joueur balayait l'app des récents dans la foulée.
        // Sans bridge, pas de WebView : CookieManager lèverait une exception.
        if (bridge != null) {
            CookieManager.getInstance().flush();
        }
    }

    @Override
    public void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        // La page courante, pour la retrouver si Android recrée l'activité (voir
        // ouvrirAuLancement). Après la mort du renderer, la WebView est détruite : on range
        // la page choisie à ce moment-là, sans l'interroger.
        String page = vueMorte ? pageApresMortDuRendu : (bridge != null ? pageARetenir(bridge.getWebView()) : null);
        if (page != null) {
            etat.putString(ETAT_PAGE, page);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null) {
            return;
        }
        if (auLancement) {
            ouvrirAuLancement(intent);
            return;
        }
        // Lien entrant, app déjà lancée (singleTask) : App Link, QR, « Ouvrir avec ».
        Uri lien = lienDuSiteRecu(intent);
        if (lien == null) {
            return;
        }
        if (vueMorte) {
            pageApresMortDuRendu = lien.toString(); // le recreate() en attente l'ouvrira
        } else {
            bridge.getWebView().loadUrl(lien.toString());
        }
    }

    /**
     * Première page d'une instance. Capacitor range l'URL reçue mais charge toujours
     * l'accueil : sans ceci, le code de table ou le jeton de réinitialisation d'un lien
     * reçu était perdu. Mais l'intent de lancement n'est un lien FRAIS qu'au premier
     * démarrage : quand Android RECRÉE l'activité (processus tué en arrière-plan, puis
     * retour par l'icône ou les récents), getIntent() rend l'intent qui a créé la tâche,
     * pas le dernier reçu. Le rejouer rouvrait une vieille invitation (rejointe d'une table
     * quittée depuis) ou un jeton déjà consommé. On rouvre alors la page où était le
     * joueur, comme un navigateur qui restaure ses onglets. Même chose pour une tâche
     * relancée depuis les récents, où Android rejoue aussi l'intent d'origine.
     */
    private void ouvrirAuLancement(Intent intent) {
        String page;
        if (restauration) {
            page = pageRestauree != null && estUnePageDeLApp(Uri.parse(pageRestauree)) ? pageRestauree : null;
        } else if (intent != null && (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            page = null;
        } else {
            Uri lien = lienDuSiteRecu(intent);
            page = lien != null ? lien.toString() : null;
        }
        if (page != null) {
            bridge.getWebView().loadUrl(page); // sinon Capacitor a déjà lancé l'accueil
        }
    }

    /** L'URL d'un intent VIEW si elle passe le contrôle strict, sinon null. */
    private static Uri lienDuSiteRecu(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return null;
        }
        Uri lien = intent.getData();
        return lien != null && estUnLienDuSite(lien) ? lien : null;
    }

    /**
     * Contrôle STRICT d'une URL avant de la charger hors navigation du site. L'activité est
     * exportée (n'importe quelle app peut lui envoyer une URL) et loadUrl ne repasse pas par
     * shouldOverrideUrlLoading : rien d'autre ne filtrerait. https seulement ; autorité
     * exactement « lepillaveur.fr », donc ni port, ni identifiants « user@ », ni sous-domaine,
     * ni URL ambiguë que Chromium lirait autrement (« evil.com\@lepillaveur.fr ») ; et jamais
     * un chemin spécial de Capacitor.
     */
    static boolean estUnLienDuSite(Uri lien) {
        String chemin = lien.getPath();
        return "https".equals(lien.getScheme())
            && HOTE_DU_SITE.equals(lien.getHost())
            && lien.getPort() == -1
            && lien.getUserInfo() == null
            && HOTE_DU_SITE.equals(lien.getEncodedAuthority())
            && (chemin == null || !chemin.startsWith(PREFIXE_CAPACITOR));
    }

    /**
     * Page de l'app qu'on peut rouvrir soi-même (restauration, « Réessayer ») : le site, ou
     * l'origine exacte de server.url, qui n'en diffère que dans la variante d'essai local
     * (http://localhost:3131). Ces URL viennent de la WebView, pas d'une autre app : les
     * liens reçus, eux, restent soumis au seul estUnLienDuSite.
     */
    private boolean estUnePageDeLApp(Uri page) {
        if (estUnLienDuSite(page)) {
            return true;
        }
        Uri app = Uri.parse(bridge.getAppUrl());
        String chemin = page.getPath();
        return app.getScheme() != null
            && app.getScheme().equals(page.getScheme())
            && app.getEncodedAuthority() != null
            && app.getEncodedAuthority().equals(page.getEncodedAuthority())
            && page.getUserInfo() == null
            && (chemin == null || !chemin.startsWith(PREFIXE_CAPACITOR));
    }

    /**
     * Page à retrouver si l'activité est recréée : la page courante du site ; sur l'écran
     * d'erreur, la page en panne qu'il remplace (celle que « Réessayer » relance) ; rien
     * sinon, et la restauration repart de l'accueil.
     */
    private String pageARetenir(WebView vue) {
        String url = vue.getUrl();
        if (url == null) {
            return null;
        }
        if (url.equals(bridge.getErrorUrl())) {
            url = urlEnEchec;
        }
        return url != null && estUnePageDeLApp(Uri.parse(url)) ? url : null;
    }

    /** Retour : page précédente du site ; à la racine, comportement système (l'app passe en arrière-plan). */
    private void reculer() {
        WebView vue = bridge != null && !vueMorte ? bridge.getWebView() : null;
        int pas = vue != null ? pasVersLaPagePrecedente(vue) : 0;
        if (pas > 0) {
            vue.goBackOrForward(-pas);
            return;
        }
        retour.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        retour.setEnabled(true);
    }

    /**
     * Nombre d'entrées à remonter, 0 à la racine. Depuis l'écran d'erreur (server.errorPath),
     * reculer d'un seul pas relancerait la page qui vient d'échouer, donc le même écran :
     * hors ligne, le retour tournerait en rond et l'app ne se quitterait plus. On saute donc
     * l'écran d'erreur ET l'entrée en échec qui le précède.
     */
    private int pasVersLaPagePrecedente(WebView vue) {
        String urlErreur = bridge.getErrorUrl();
        WebBackForwardList historique = vue.copyBackForwardList();
        int courant = historique.getCurrentIndex();
        if (urlErreur == null || courant < 0 || !urlErreur.equals(historique.getItemAtIndex(courant).getUrl())) {
            return vue.canGoBack() ? 1 : 0;
        }
        int cible = courant - 1;
        while (cible >= 0) {
            String url = historique.getItemAtIndex(cible).getUrl();
            if (url != null && !url.equals(urlErreur) && !url.equals(urlEnEchec)) {
                break;
            }
            cible--;
        }
        return cible >= 0 ? courant - cible : 0;
    }

    /**
     * Panne du serveur ou de la route jusqu'à lui, seul cas où l'écran de secours (« La
     * table ne répond pas ») dit vrai : 502/503/504 de Caddy ou de Cloudflare, 520 à 530
     * propres à Cloudflare (origine injoignable, délai dépassé…). Tout le reste garde la
     * réponse du serveur : une 404 ou une 500 affichent la page du site, traduite et avec
     * sa navigation, plus juste qu'un « vérifie ta connexion » ; et un DÉFI Cloudflare
     * (403 ou 503 portant cf-mitigated: challenge, règle WAF ou mode « Under Attack ») doit
     * s'afficher et s'exécuter pour poser cf_clearance. Remplacé par l'écran de secours, il
     * ne passait jamais, et « Réessayer » retombait dessus en boucle.
     */
    private static boolean estUnePanneDuServeur(WebResourceResponse reponse) {
        int code = reponse.getStatusCode();
        boolean passerelle = code == 502 || code == 503 || code == 504 || (code >= 520 && code <= 530);
        return passerelle && !estUnDefiCloudflare(reponse);
    }

    /** En-tête cf-mitigated présent. Nom comparé sans la casse : HTTP ne la fixe pas, rien ne garantit celle de la Map. */
    private static boolean estUnDefiCloudflare(WebResourceResponse reponse) {
        Map<String, String> entetes = reponse.getResponseHeaders();
        if (entetes == null) {
            return false;
        }
        for (String nom : entetes.keySet()) {
            if ("cf-mitigated".equalsIgnoreCase(nom)) {
                return true;
            }
        }
        return false;
    }

    /** Client WebView de Capacitor, chemins spéciaux fermés et écran d'erreur réservé aux vraies pannes. */
    private class ClientDuSite extends BridgeWebViewClient {

        private final Bridge pont;

        ClientDuSite(Bridge pont) {
            super(pont);
            this.pont = pont;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView vue, WebResourceRequest requete) {
            String chemin = requete.getUrl().getPath();
            if (chemin != null && chemin.startsWith(PREFIXE_CAPACITOR)) {
                return new WebResourceResponse(
                    "text/plain",
                    "utf-8",
                    403,
                    "Forbidden",
                    Collections.emptyMap(),
                    new ByteArrayInputStream(new byte[0])
                );
            }
            return super.shouldInterceptRequest(vue, requete);
        }

        @Override
        public void onReceivedError(WebView vue, WebResourceRequest requete, WebResourceError erreur) {
            if (requete.isForMainFrame()) {
                urlEnEchec = requete.getUrl().toString();
            }
            super.onReceivedError(vue, requete, erreur); // charge l'écran d'erreur (server.errorPath)
        }

        @Override
        public void onReceivedHttpError(WebView vue, WebResourceRequest requete, WebResourceResponse reponse) {
            if (!requete.isForMainFrame()) {
                super.onReceivedHttpError(vue, requete, reponse); // ressource secondaire : écouteurs prévenus, rien d'autre
                return;
            }
            if (!estUnePanneDuServeur(reponse)) {
                // Pas de super : Capacitor remplacerait la réponse par l'écran d'erreur. Ses
                // écouteurs ne sont donc pas prévenus de cette réponse ; aucun ne s'en sert
                // (SystemBars n'écoute que onPageCommitVisible).
                return;
            }
            urlEnEchec = requete.getUrl().toString();
            super.onReceivedHttpError(vue, requete, reponse);
        }

        @Override
        public void onPageFinished(WebView vue, String url) {
            super.onPageFinished(vue, url);
            String urlErreur = pont.getErrorUrl();
            if (urlErreur == null) {
                return;
            }
            if (urlErreur.equals(url)) {
                proposerDeReessayer(vue);
                return;
            }
            // Page du site chargée juste APRÈS l'écran d'erreur : on en sort par « Réessayer »
            // (ou par un lien entrant), c'est un nouveau départ. Sans ce ménage, le retour
            // ramènerait sur l'écran d'erreur. Le retour depuis l'écran d'erreur, lui, recule
            // dans l'historique : l'écran passe devant, pas derrière, et rien n'est effacé.
            WebBackForwardList historique = vue.copyBackForwardList();
            int courant = historique.getCurrentIndex();
            if (courant > 0 && urlErreur.equals(historique.getItemAtIndex(courant - 1).getUrl())) {
                vue.clearHistory();
            }
        }

        /**
         * « Réessayer » relance la page en panne, et non l'accueil : sinon le code de table
         * d'un lien reçu (/invite/…) ou le jeton d'un e-mail (/compte/reinitialiser?token=…)
         * était perdu au retour du réseau. Passé par un appel de script, pas par l'URL :
         * Capacitor ne sert l'écran depuis les assets que pour l'URL d'erreur EXACTE (une
         * query partirait sur le réseau, en panne, et reviendrait ici en boucle). Page
         * inconnue : server.url, ce qui garde aussi l'essai local sur le serveur du PC.
         */
        private void proposerDeReessayer(WebView vue) {
            String cible = urlEnEchec != null && estUnePageDeLApp(Uri.parse(urlEnEchec)) ? urlEnEchec : pont.getAppUrl();
            vue.evaluateJavascript("window.reessayerVers && window.reessayerVers(" + JSONObject.quote(cible) + ")", null);
        }
    }

    /**
     * Mort du processus de rendu (souvent tué pour libérer la mémoire sur les pages canvas :
     * Crobard, Plinko). Sans prise en charge, Android tue toute l'app et le plantage compte
     * dans Android Vitals. La WebView morte est inutilisable : on la détache, on la détruit
     * et on recrée l'activité, qui rouvre la page où était le joueur (onSaveInstanceState).
     * Garde-fous : une 2e mort en rafale repart de l'accueil, au cas où la page tuerait le
     * renderer ; une 3e, accueil compris, laisse planter (pilote GPU ou WebView cassés :
     * recharger sans fin toutes les secondes serait pire, et le plantage reste visible
     * dans Vitals). En arrière-plan, rien n'est rechargé avant le retour du joueur : c'est
     * là que le système tue le plus souvent le renderer, et recharger le site (SSE,
     * présence) sans spectateur l'exposait à être tué de nouveau, en boucle.
     */
    private class SurvieDuRendu extends WebViewListener {

        @Override
        public boolean onRenderProcessGone(WebView vue, RenderProcessGoneDetail detail) {
            boolean auPremierPlan = getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED);
            boolean versAccueil = false;
            if (auPremierPlan) {
                // Seules les morts sous les yeux du joueur comptent : une mort en arrière-plan
                // (mémoire réclamée par une autre app) ne dit rien de la page.
                long maintenant = SystemClock.elapsedRealtime();
                mortsEnRafale = maintenant - derniereMortDuRendu < DELAI_BOUCLE_RENDU_MS ? mortsEnRafale + 1 : 1;
                derniereMortDuRendu = maintenant;
                if (mortsEnRafale > 2) {
                    return false;
                }
                versAccueil = mortsEnRafale == 2;
            }
            // Lue AVANT destroy() : la WebView garde son URL même renderer mort.
            pageApresMortDuRendu = versAccueil ? null : pageARetenir(vue);
            vueMorte = true;

            ViewParent parent = vue.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(vue);
            }
            vue.destroy();

            if (auPremierPlan) {
                recreate();
            } else {
                aRecreerAuRetour = true; // onStart
            }
            return true;
        }
    }
}
