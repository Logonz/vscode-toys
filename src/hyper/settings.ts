// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { activateLayer, deactivateLayer } from "./layer";
import { HyperLayer, LayerActivateInput, LayerDeactivateInput } from "./types";



const registeredLayerDisposables: vscode.Disposable[] = [];

function unregisterAllLayers() {
  registeredLayerDisposables.forEach(disposable => disposable.dispose());
  registeredLayerDisposables.length = 0;
}

function registerNormalLayer(context: vscode.ExtensionContext, layer: HyperLayer) {
  // Register activate command
  const activateDisposable = vscode.commands.registerCommand(`vstoys.hyper.layerActivate.${layer.name}`, (args) => {
    const layerInput: LayerActivateInput = {
      layerName: layer.name,
      layerType: "normal",
      timeout: layer.timeout || 6,
      command: args?.command
    };
    activateLayer(layerInput);
  });

  // Register deactivate command
  const deactivateDisposable = vscode.commands.registerCommand(`vstoys.hyper.layerDeactivate.${layer.name}`, (args) => {
    const layerInput: LayerDeactivateInput = {
      layerName: layer.name,
      deactivateAll: args?.deactivateAll || false
    };
    deactivateLayer(layerInput);
  });

  registeredLayerDisposables.push(activateDisposable, deactivateDisposable);
  context.subscriptions.push(activateDisposable, deactivateDisposable);
}

function registerSwitchLayer(context: vscode.ExtensionContext, layer: HyperLayer) {
  // Register switch command
  const switchDisposable = vscode.commands.registerCommand(`vstoys.hyper.layerSwitch.${layer.name}`, (args) => {
    const layerInput: LayerActivateInput = {
      layerName: layer.name,
      layerType: 'switch',
      timeout: layer.timeout || 6,
      command: args?.command
    };
    activateLayer(layerInput);
  });

  // Register deactivate command
  const deactivateDisposable = vscode.commands.registerCommand(`vstoys.hyper.layerDeactivate.${layer.name}`, (args) => {
    const layerInput: LayerDeactivateInput = {
      layerName: layer.name,
      deactivateAll: args?.deactivateAll || false
    };
    deactivateLayer(layerInput);
  });

  registeredLayerDisposables.push(switchDisposable, deactivateDisposable);
  context.subscriptions.push(switchDisposable, deactivateDisposable);
}

function checkForDuplicateNames(normalLayers: HyperLayer[], switchLayers: HyperLayer[]): string[] {
  const allNames = new Set<string>();
  const duplicates: string[] = [];

  // Check for duplicates within normalLayers
  for (const layer of normalLayers) {
    if (allNames.has(layer.name)) {
      duplicates.push(layer.name);
    } else {
      allNames.add(layer.name);
    }
  }

  // Check for duplicates within switchLayers and between normalLayers and switchLayers
  for (const layer of switchLayers) {
    if (allNames.has(layer.name)) {
      duplicates.push(layer.name);
    } else {
      allNames.add(layer.name);
    }
  }

  return [...new Set(duplicates)]; // Remove duplicate entries in the duplicates array
}

function registerLayersFromConfig(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("vstoys.hyper");
  const normalLayers: HyperLayer[] = config.get("normalLayers", []);
  const switchLayers: HyperLayer[] = config.get("switchLayers", []);

  // Check for duplicate names
  const duplicates = checkForDuplicateNames(normalLayers, switchLayers);

  if (duplicates.length > 0) {
    // TODO: Maybe we want to register non-duplicate layers still.
    const message = `Hyper layers configuration error: Duplicate layer names found: ${duplicates.join(", ")}. Please ensure all layer names are unique across both Normal Layers and Switch Layers.`;
    vscode.window.showErrorMessage(message);
    console.error("Hyper:", message);
    return; // Don't register any layers if there are duplicates
  }

  // Unregister existing layers first
  unregisterAllLayers();

  // Register normal layers
  normalLayers
    .filter(layer => layer.enabled !== false) // Default to enabled if not specified
    .forEach(layer => {
      try {
        registerNormalLayer(context, layer);
        console.log(`Registered normal layer: ${layer.name}`);
      } catch (error) {
        console.error(`Failed to register normal layer ${layer.name}:`, error);
        vscode.window.showErrorMessage(`Failed to register normal layer: ${layer.name}`);
      }
    });

  // Register switch layers
  switchLayers
    .filter(layer => layer.enabled !== false) // Default to enabled if not specified
    .forEach(layer => {
      try {
        registerSwitchLayer(context, layer);
        console.log(`Registered switch layer: ${layer.name}`);
      } catch (error) {
        console.error(`Failed to register switch layer ${layer.name}:`, error);
        vscode.window.showErrorMessage(`Failed to register switch layer: ${layer.name}`);
      }
    });

  const totalRegistered =
    (normalLayers.filter(l => l.enabled !== false).length +
    switchLayers.filter(l => l.enabled !== false).length) * 2; // Each layer gets 2 commands (activate + deactivate)

  console.log(`Hyper: Successfully registered ${totalRegistered} layer commands (activate + deactivate pairs)`);
}

export function startConfigListeners(context: vscode.ExtensionContext) {
  // Initial registration
  registerLayersFromConfig(context);

  const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("vstoys.hyper.normalLayers") ||
        event.affectsConfiguration("vstoys.hyper.switchLayers")) {
      console.log("Hyper: Layer configuration changed, updating registered commands");
      registerLayersFromConfig(context);
    }
  });

  context.subscriptions.push(configChangeListener);
}
