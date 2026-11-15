import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/components/icon';

/** Avvertenze: cosa l'app è e cosa non è, quando serve un professionista, fonti e licenze dei dati. */
@Component({
  selector: 'app-disclaimer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <a routerLink="/" class="btn-ghost -ml-3 mb-3 px-3 py-1.5 text-sm"><app-icon name="arrow-left" [size]="16" /> Torna alla ricerca</a>

    <header class="mb-6">
      <h1 class="page-title">Avvertenze</h1>
      <p class="page-subtitle">Come leggere i numeri di NutriOssalati e quando serve un professionista.</p>
    </header>

    <div class="max-w-3xl space-y-5 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
      <section class="card p-5">
        <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-white">
          <app-icon name="info" class="text-brand-600" /> È uno strumento informativo
        </h2>
        <p class="mt-2">
          NutriOssalati mostra dati sugli alimenti e fa dei calcoli. Non sostituisce il medico, il dietista o gli esami: non
          fa diagnosi e non prescrive diete.
        </p>
        <p class="mt-2">
          I valori di ossalato sono indicativi: cambiano con varietà, terreno, maturazione e cottura, e le fonti non sempre
          concordano. Il bilancio calcio-ossalati è una stima teorica basata sul rapporto molare: in generale il calcio
          alimentare può legare parte degli ossalati nell'intestino, ma la risposta individuale varia.
        </p>
      </section>

      <section class="card p-5">
        <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-white">
          <app-icon name="user" class="text-brand-600" /> Quando confrontarsi con un professionista
        </h2>
        <p class="mt-2">Prima di cambiare alimentazione sulla base di questi numeri, parlane con il medico o il dietista se:</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>hai o hai avuto calcoli renali;</li>
          <li>hai iperossaluria, malattia renale cronica, osteoporosi o iperparatiroidismo;</li>
          <li>hai un malassorbimento intestinale;</li>
          <li>sei in gravidanza;</li>
          <li>l'alimentazione riguarda un bambino o un ragazzo;</li>
          <li>sei in terapia con calcio, vitamina D o diuretici.</li>
        </ul>
      </section>

      <section class="card p-5">
        <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-white">
          <app-icon name="scale" class="text-brand-600" /> Il calcio
        </h2>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>Non ridurre drasticamente il calcio senza una valutazione professionale.</li>
          <li>Il fabbisogno di calcio è individuale: l'app non indica una dose personale.</li>
          <li>I suggerimenti dell'app sono sempre alimenti, mai integratori.</li>
        </ul>
      </section>

      <section class="card border-rose-200 bg-rose-50 p-5 text-rose-950 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <app-icon name="alert" /> Sintomi da non aspettare
        </h2>
        <p class="mt-2">Contatta un servizio sanitario se compaiono:</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>sangue nelle urine;</li>
          <li>dolore lombare forte;</li>
          <li>febbre;</li>
          <li>vomito persistente;</li>
          <li>difficoltà a urinare.</li>
        </ul>
      </section>

      <section class="card p-5">
        <h2 class="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-white">
          <app-icon name="book" class="text-brand-600" /> Fonti dei dati
        </h2>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Nutrienti:</strong> USDA FoodData Central e tabelle CREA di composizione degli alimenti.</li>
          <li>
            <strong>Ossalati:</strong> lista della Harvard T.H. Chan School of Public Health e letteratura scientifica. La
            scheda di ogni alimento indica la fonte e l'affidabilità della stima.
          </li>
          <li>
            <strong>Prodotti confezionati (codice a barre):</strong> dati di
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" class="underline">Open Food Facts</a>, compilati
            dalla comunità e distribuiti con licenza
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener" class="underline">Open Database License (ODbL)</a>.
            Possono essere incompleti o contenere errori; le etichette non riportano gli ossalati.
          </li>
        </ul>
        <p class="mt-2">Dove un valore manca, l'app scrive «dato non disponibile»: non lo sostituisce con uno zero né con una stima.</p>
      </section>
    </div>
  `,
})
export class DisclaimerPage {}
