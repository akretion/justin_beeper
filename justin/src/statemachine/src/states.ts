
export class Shipment {
  packs: Array<Pack> = [];
  name = 'WH/OUT102';
  carrier = '';
  products = [];
  partial_allowed = false;
  emplacement = {
    //inexistant avant rassemblement
    //en zone d'expedition
    //en zone de chargement
    //en zone client
    //en zone reserve ?
  }
  stateMachine: StateMachine;
  statesAction: Array<any>;
  constructor() {
    this.stateMachine = new StateMachine();
    this.stateMachine.state = 'init';
    this.stateMachine.events = <Array<StateEvent>>([
      { name:'créer', from: 'init', to: 'en attente', conditions: [], actions:[]}, //liste de packs ou de produits?
      //de receptions, de colisage, de destockage
      { name:'setPack', from: 'en attente', to:'en attente',
      conditions: [
      ], actions:[
        (args) => {
          let pack = args.pack;
          if (this.packs.indexOf(pack) === -1)
            this.packs.push(pack);
        }
      ]},
      { name:'update', from: 'en attente',  to: 'à assembler',
      conditions: [
        () => { if (!this.packs.length)
          return Promise.reject('Pas de packs');
        },
        () => {
          console.log('on check que tout soit bien colise');
          if (!this.packs.every( (pack) => pack.stateMachine.state === 'created'))
            return Promise.reject('Tous les colis ne sont pas colisés');
         },
        () => {
          console.log('on check que tous les produits soit colisés');
          if (!this.products.every( (product) => product.stateMachine.state === 'colisé'))
            return Promise.reject('Tous les produits ne sont pas colisés');
        }
      ], actions:[ ]},
      { name:'assembler', from: 'à assembler', to: 'assemblé', conditions: [
        () => Promise.all(this.packs.map( (p) => p.stateMachine.can('assembler')))
      ], actions:[
        () => this.packs.forEach( (p) => p.stateMachine.go('assembler'))
      ]},
      { name:'print', from: 'assemblé', to: 'étiqueté', conditions: [], actions:[
        (transporteur) => { this.carrier = transporteur }
      ]},
      { name:'charger', from: 'étiqueté', to: 'chargé', conditions: [], actions:[]}, //expedier ?
    ]);

    this.statesAction = [
      {name: 'en attente', action: () => {
        var nextStep = new Set();
        function tousLesProduitsSontColisés(shipment) {
          return shipment.products.every(
            (product) => product.stateMachine.state == 'colisé'
          );
        }
        function tousLesPacksSontEnTransit(shipment) {
          return shipment.packs.every(
            (pack) => pack.locationSM.state == 'transit'
          )
        }
        //on regarde que tous les produits soient recep
        if (tousLesProduitsSontColisés(this)) {
          if (tousLesPacksSontEnTransit(this)) {
            return nextStep.add("assembler");
          }
          return nextStep.add("destocker");
        } else {
          return nextStep.add("setPack");
        }
      }},
      {name:'à assembler', action: () => {

        var nextSteps = new Set()
        this.packs.forEach(
          (pack)=> {
            pack.nextSteps().map( (ste) => nextSteps.add(ste) )
          }
        );
        console.log('voici notre trouvaille');
        return nextSteps;
      }}
    ];
  }
  créer(){
    return this.stateMachine.go('créer');
  }
  setPack(pack) {
    return this.stateMachine.go('setPack', {pack: pack});
  }
  update() { //= sommes nous dernier ?
    //mettre à jour l'etat
    return this.stateMachine.go('update');
  }
  assembler() {
    return this.stateMachine.go('assembler');
  }
  étiqueter(transporteur) {
    return this.stateMachine.go('print');
  }
  charger() {
//    this.stateMachine.go('');
  }
  nextSteps() {
    var stateAction = this.statesAction.find((s) => s.name == this.stateMachine.state );
    if (!stateAction){
      console.info('stateAction introuvable', this.stateMachine.state, this.statesAction)
      return [];
    }
    return Array.from(stateAction.action());
  }
};

export class Pack { //carton
  products: Array<Product> = [];//contien des doublons
  shipment: Shipment;
  name: String;
  label: String;
  place: String;
  category: String;
  weight = 0;
  locationSM: StateMachine;
  stateMachine: StateMachine;
  statesAction: Array<any>;
  constructor() {
    this.locationSM = new StateMachine();
    this.locationSM.state = 'init';
    this.locationSM.events = <Array<StateEvent>>([
      {name:'créer', from: 'init', to:'transit', conditions: [], actions:[]},
      {name:'stocker', from: 'transit', to:'stock', conditions: [], actions: [
        (args) => {
          this.place = args.place;
        }
      ]},
      {name:'destocker', from: 'stock', to:'transit', conditions: [], actions:[]},
      {name:'assembler', from: 'transit', to:'transit', conditions: [], actions:[]},
      {name:'expedier', from: 'transit', to:'terminé', conditions: [], actions:[]},
    ]);

    this.stateMachine = new StateMachine();
    this.stateMachine.state = 'init';
    this.stateMachine.events = <Array<StateEvent>>([
      {name:'créer', from: 'init', to: 'init', conditions: [], actions:[]},
      {name:'coliser', from: 'init', to: 'created', conditions: [
        (args) => {
          let weight = parseFloat(args.weight);
          if (!args.weight)
            return Promise.reject("pas de poids");
          if (weight <= 0)
            return Promise.reject('poids null');
        },
        (args) => {
          console.log('voici args', args);
          if (!args.products.length)
            return Promise.reject('Pas de produits');
        },
        (args) => {
          let ship = args.products[0].shipment;
          if (!args.products.every(prod => prod.shipment == ship))
            return Promise.reject('All the products are not from the same shipment');
        },
        (args) => {
          return Promise.all(
            args.products.map(prod => prod.stateMachine.can('coliser', {pack: this}))
          ).catch( () => Promise.reject("All the products are not packable"));
        }
      ], actions:[
        (args) => this.weight = parseFloat(args.weight),
        (args) => this.products = args.products,
        (args) => this.products.forEach( prod => prod.coliser(this)),
        (args) => this.locationSM.go('créer')
      ]},
      {name:'assembler', from: 'created', to: 'assemblé', conditions: [
        () => this.locationSM.can('assembler'),
      ], actions:[]},
    ]);

    this.statesAction = [
      { name:'init', action: () => {
        var steps = new Set()
        steps.add('coliser');
        return steps;
      }},
      { name:'created', action: () => {
        var steps = new Set();
        if (this.locationSM.state == 'transit')
          steps.add('assembler');
        if (this.locationSM.state == 'stock')
          steps.add('destocker'); //est-ce pas plutot au shipment de dire ça?
        return steps;
      }}
    ];

  }
  créer() {
    return this.stateMachine.go('créer');
  }
  coliser(weight, products: Array<Product>) {
    console.log('voici products', products);
    return this.stateMachine.go('coliser', {weight: weight, products: products});
  }
  assembler() {
    return this.stateMachine.go('assembler');
  }
  stocker(place) {
    return this.locationSM.go('stocker', { place: place});
  }
  destocker() {
    return this.locationSM.go('destocker');
  }
  nextSteps() {
    var stateAction = this.statesAction.find((s) => s.name == this.stateMachine.state );
    if (!stateAction)
      return [];
    console.log("action : ", stateAction);
    return Array.from(stateAction.action());
  }
}

 export class Product { //chaque produit est unique
  name = '';
  shipment: Shipment;
  isExpected = true;
  pack: Pack;
  category: String;
  stateMachine: StateMachine;
  constructor() {
    this.stateMachine = new StateMachine();
    this.stateMachine.events = <Array<StateEvent>>[
      { name:'produire', from: 'init', to: 'available', conditions: [], actions:[]}, //produire is done on odoo
      { name:'receptionner', from: 'available', to: 'receptionné', conditions: [], actions:[]},
      { name:'coliser', from: 'receptionné', to: 'colisé', conditions: [
        (args) => {
          let pack = args.pack;
          if (!pack)
            return Promise.reject('No pack');
          return Promise.resolve();
        }
      ], actions:[
          (args) => {
            this.pack = args.pack;
          }
      ]}
    ];
  }
  receptionner() {
    console.log('on receptionne');
    return this.stateMachine.go('receptionner');
  }
  coliser(pack:Pack) {
    console.log('colisage du produit avec le pack ',pack);
    return this.stateMachine.go('coliser', {pack: pack});
  }
  nextSteps() {
    var nextSteps = [];
    if (this.stateMachine.state == 'available')
        nextSteps = ["receptionner"]
    if (this.stateMachine.state == 'receptionné')
        nextSteps = ["coliser"];
    if (this.stateMachine.state == "colisé")
        nextSteps = [];
    return nextSteps;
  }
}


export class StateEvent {
  name: string;
  from: string;
  to: string;
  conditions: Array<any> = [];
  actions: Array<any> = [];
}
export class StateMachine {
  events: Array<StateEvent>;
  state: string = 'init';
  public availableState() {
    return this.events.filter((s:any) => s.from == this.state);
  }
  public nextState(event) {
    return this.availableState().filter((s:any) => s.name == event)[0];
  }
  public possibleStates() {
    return new Promise(
      (resolve, reject) => {
        let succeeds = [];
        let proms = this.availableState().map(
          state => this.can(state.name).then(
            () => succeeds.push(state.name)
          , (v) => console.log('oesf', v)
          )
        );
        Promise.all(proms).then(
          () => resolve(succeeds)
        );
      }
    );
  }
  public can(event, args = {}) {
    var nextState = this.nextState(event)
    if (!nextState)
      return Promise.reject("Invalid state. Available: " +  this.availableState().map(x=>x.name).join(', '));

    function every(tab) {
      return Promise.all(tab.map( f => f(args)));
    }
    return every(nextState.conditions).then(
      () => {
        return Promise.resolve((conditions, actions) => {
          return every(nextState.actions).then(
            () => this.state = nextState.to
          );
        })
      }
    );
/*    return Promise.resolve( (conditions, actions) => {
        if (nextState.conditions)
          conditions = nextState.conditions;
        if (nextState.actions)
          actions = nextState.actions;

        function every(tab) {
          return Promise.all(tab.map( f => f(self)));
        }
        return every(conditions).then(() => every(actions)).then(
          () => this.state = nextState.to
        );
    });*/
  }
  public go(event, args = {}) {
    return this.can(event, args).then( (f) => f());
  }
}
