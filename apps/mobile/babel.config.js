module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Obligatoirement en dernier : il réécrit les fonctions marquées
      // « worklet » pour qu'elles tournent sur le fil de l'interface, et tout
      // plugin placé après lui verrait du code déjà transformé.
      //
      // Oublier cette ligne ne casse pas la compilation : ça donne des erreurs
      // d'exécution obscures, au moment où l'animation démarre.
      'react-native-worklets/plugin',
    ],
  }
}
