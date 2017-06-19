sap.ui.define([
    "mycompany/myapp/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "mycompany/myapp/model/formatter",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/generic/app/navigation/service/NavigationHandler",
    "sap/ui/generic/app/navigation/service/NavType"
], function(BaseController, JSONModel, formatter, Filter, FilterOperator, MessageToast, MessageBox, NavigationHandler, NavType) {
    "use strict";

    return BaseController.extend("mycompany.myapp.controller.Worklist", {

        formatter: formatter,

        /* =========================================================== */
        /* lifecycle methods                                           */
        /* =========================================================== */

        /**
         * Called when the worklist controller is instantiated.
         * @public
         */
        onInit: function() {
            var oViewModel,
                iOriginalBusyDelay,
                oTable = this.byId("table");

            // Put down worklist table's original value for busy indicator delay,
            // so it can be restored later on. Busy handling on the table is
            // taken care of by the table itself.
            iOriginalBusyDelay = oTable.getBusyIndicatorDelay();
            this._oTable = oTable;

            // keeps the app state
            this._oAppState = {
                selectedTabFilter: "all",
                searchText: "",
                selectedContextPaths: [],
                selectedCategories: [],
                selectedSuppliers: []
            };

            // Model used to manipulate control states
            oViewModel = new JSONModel({
                worklistTableTitle: this.getResourceBundle().getText("worklistTableTitle"),
                saveAsTileTitle: this.getResourceBundle().getText("worklistViewTitle"),
                shareOnJamTitle: this.getResourceBundle().getText("worklistViewTitle"),
                shareSendEmailSubject: this.getResourceBundle().getText("shareSendEmailWorklistSubject"),
                shareSendEmailMessage: this.getResourceBundle().getText("shareSendEmailWorklistMessage", [location.href]),
                tableNoDataText: this.getResourceBundle().getText("tableNoDataText"),
                tableBusyDelay: 0,
                inStock: 0,
                shortage: 0,
                outOfStock: 0,
                countAll: 0
            });
            this.setModel(oViewModel, "worklistView");

            // create an instance of the navigation handler
            this.oNavigationHandler = new NavigationHandler(this);

            // on back navigation, the previous app state is returned in the resolved Promise
            this.oNavigationHandler.parseNavigation().done(this.onNavigationDone.bind(this));

            // Create an object of filters
            this._mFilters = {
                "inStock": [new sap.ui.model.Filter("UnitsInStock", "GT", 10)],
                "outOfStock": [new sap.ui.model.Filter("UnitsInStock", "LE", 0)],
                "shortage": [new sap.ui.model.Filter("UnitsInStock", "BT", 1, 10)],
                "all": []
            };

            // Make sure, busy indication is showing immediately so there is no
            // break after the busy indication for loading the view's meta data is
            // ended (see promise 'oWhenMetadataIsLoaded' in AppController)
            oTable.attachEventOnce("updateFinished", function() {
                // Restore original busy indicator delay for worklist's table
                oViewModel.setProperty("/tableBusyDelay", iOriginalBusyDelay);
            });



        },

        /* =========================================================== */
        /* event handlers                                              */
        /* =========================================================== */

        /**
         * Triggered by the table's 'updateFinished' event: after new table
         * data is available, this handler method updates the table counter.
         * This should only happen if the update was successful, which is
         * why this handler is attached to 'updateFinished' and not to the
         * table's list binding's 'dataReceived' method.
         * @param {sap.ui.base.Event} oEvent the update finished event
         * @public
         */
        onUpdateFinished: function(oEvent) {
            // update the worklist's object counter after the table update
            var sTitle,
                oTable = oEvent.getSource(),
                oViewModel = this.getModel("worklistView"),
                iTotalItems = oEvent.getParameter("total");
            // only update the counter if the length is final and
            // the table is not empty
            if (iTotalItems && oTable.getBinding("items").isLengthFinal()) {
                sTitle = this.getResourceBundle().getText("worklistTableTitleCount", [iTotalItems]);

                // Get the count for all the products and set the value to 'countAll' property
                this.getModel().read("/Products/$count", {
                    success: function(oData) {
                        oViewModel.setProperty("/countAll", oData);
                    }
                });

                // read the count for the unitsInStock filter
                this.getModel().read("/Products/$count", {
                    success: function(oData) {
                        oViewModel.setProperty("/inStock", oData);
                    },
                    filters: this._mFilters.inStock
                });

                // read the count for the outOfStock filter
                this.getModel().read("/Products/$count", {
                    success: function(oData) {
                        oViewModel.setProperty("/outOfStock", oData);
                    },
                    filters: this._mFilters.outOfStock
                });

                // read the count for the shortage filter
                this.getModel().read("/Products/$count", {
                    success: function(oData) {
                        oViewModel.setProperty("/shortage", oData);
                    },
                    filters: this._mFilters.shortage
                });

            } else {
                sTitle = this.getResourceBundle().getText("worklistTableTitle");
            }
            this.getModel("worklistView").setProperty("/worklistTableTitle", sTitle);
        },

        /**
         * Event handler when a table item gets pressed
         * @param {sap.ui.base.Event} oEvent the table selectionChange event
         * @public
         */
        onPress: function(oEvent) {
            // save table selection to appState
            this._oAppState.selectedContextPaths = this.byId("table").getSelectedContextPaths();

            this.oNavigationHandler.navigate("Navigation", "sample", {}, { customData: this._oAppState }, undefined);

            // The source is the list item that got pressed
            // this._showObject(oEvent.getSource());
        },

        /**
         * Navigates back in the browser history, if the entry was created by this app.
         * If not, it navigates to the Fiori Launchpad home page.
         * @public
         */
        onNavBack: function() {
            var oHistory = sap.ui.core.routing.History.getInstance(),
                sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                // The history contains a previous entry
                history.go(-1);
            }
        },

        onSearch: function(oEvent) {
            if (oEvent.getParameters().refreshButtonPressed) {
                // Search field's 'refresh' button has been pressed.
                // This is visible if you select any master list item.
                // In this case no new search is triggered, we only
                // refresh the list binding.
                this.onRefresh();
            } else {
                this._oAppState.searchText = oEvent.getParameter("query");
                this._applyFilters();
            }

        },

        /**
         * Event handler for refresh event. Keeps filter, sort
         * and group settings and refreshes the list binding.
         * @public
         */
        onRefresh: function() {
            this._oTable.getBinding("items").refresh();
        },

        /* =========================================================== */
        /* internal methods                                            */
        /* =========================================================== */

        /**
         * Shows the selected item on the object page
         * On phones a additional history entry is created
         * @param {sap.m.ObjectListItem} oItem selected Item
         * @private
         */
        _showObject: function(oItem) {
            this.getRouter().navTo("object", {
                objectId: oItem.getBindingContext().getProperty("ProductID")
            });
        },

        /**
         * Internal helper method to apply both filter and search state together on the list binding
         * @private
         */
        _applyFilters: function() {
            var oViewModel = this.getModel("worklistView");

            var aProductNameFilter = [];
            if (this._oAppState.searchText && this._oAppState.searchText.length > 0) {
                aProductNameFilter = [new Filter("ProductName", FilterOperator.Contains, this._oAppState.searchText)];
            }

            var aCategoryFilters = this._oAppState.selectedCategories.map(function(sKey) {
                return new Filter("CategoryID", FilterOperator.EQ, sKey)
            });

            var aSupplierFilters = this._oAppState.selectedSuppliers.map(function(sKey) {
                return new Filter("SupplierID", FilterOperator.EQ, sKey)
            });

            var aFilters = [].concat(this._mFilters[this._oAppState.selectedTabFilter], aSupplierFilters, aCategoryFilters, aProductNameFilter);
            this._oTable.getBinding("items").filter(aFilters, "Application");
            // changes the noDataText of the list in case there are no filter results
            if (aFilters.length !== 0) {
                oViewModel.setProperty("/tableNoDataText", this.getResourceBundle().getText("worklistNoDataWithSearchText"));
            }
        },

        /**
         * Displays an error message dialog. The displayed dialog is content density aware.
         * @param {String} sMsg The error message to be displayed
         * @private
         */
        _showErrorMessage: function(sMsg) {
            MessageBox.error(sMsg, {
                styleClass: this.getOwnerComponent().getContentDensityClass()
            });
        },

        /**
         * Event handler when a filter tab gets pressed
         * @param {sap.ui.base.Event} oEvent the filter tab event
         * @public
         */
        onQuickFilter: function(oEvent) {
            this._oAppState.selectedTabFilter = oEvent.getParameter("selectedKey");
            this._applyFilters();
        },

        /**
         * Error and success handler for the unlist action.
         * @param {string} sProductId the product ID for which this handler is called
         * @param {boolean} bSuccess true in case of a success handler, else false (for error handler)
         * @param {number} iRequestNumber the counter which specifies the position of this request
         * @param {number} iTotalRequests the number of all requests sent
         * @private
         */
        _handleUnlistActionResult: function(sProductId, bSuccess, iRequestNumber, iTotalRequests) {
            // we could create a counter for successful and one for failed requests
            // however, we just assume that every single request was successful and display a success message once
            if (iRequestNumber === iTotalRequests) {
                MessageToast.show(this.getModel("i18n").getResourceBundle().getText("StockRemovedSuccessMsg", [iTotalRequests]));
            }
        },

        /**
         * Error and success handler for the reorder action.
         * @param {string} sProductId the product ID for which this handler is called
         * @param {boolean} bSuccess true in case of a success handler, else false (for error handler)
         * @param {number} iRequestNumber the counter which specifies the position of this request
         * @param {number} iTotalRequests the number of all requests sent
         * @private
         */
        _handleReorderActionResult: function(sProductId, bSuccess, iRequestNumber, iTotalRequests) {
            // we could create a counter for successful and one for failed requests
            // however, we just assume that every single request was successful and display a success message once
            if (iRequestNumber === iTotalRequests) {
                MessageToast.show(this.getModel("i18n").getResourceBundle().getText("StockUpdatedSuccessMsg", [iTotalRequests]));
            }
        },

        /**
         * Event handler for the unlist button. Will delete the
         * product from the (local) model.
         * @public
         */
        onUnlistObjects: function() {
            var aSelectedProducts, i, sPath, oProduct, oProductId;

            aSelectedProducts = this.byId("table").getSelectedItems();
            if (aSelectedProducts.length) {
                for (i = 0; i < aSelectedProducts.length; i++) {
                    oProduct = aSelectedProducts[i];
                    oProductId = oProduct.getBindingContext().getProperty("ProductID");
                    sPath = oProduct.getBindingContextPath();
                    this.getModel().remove(sPath, {
                        success: this._handleUnlistActionResult.bind(this, oProductId, true, i + 1, aSelectedProducts.length),
                        error: this._handleUnlistActionResult.bind(this, oProductId, false, i + 1, aSelectedProducts.length)
                    });
                }
            } else {
                this._showErrorMessage(this.getModel("i18n").getResourceBundle().getText("TableSelectProduct"));
            }
        },


        /**
         * Event handler for the reorder button. Will reorder the
         * product by updating the (local) model
         * @public
         */
        onUpdateStockObjects: function() {
            var aSelectedProducts, i, sPath, oProductObject;

            aSelectedProducts = this.byId("table").getSelectedItems();
            if (aSelectedProducts.length) {
                for (i = 0; i < aSelectedProducts.length; i++) {
                    sPath = aSelectedProducts[i].getBindingContextPath();
                    oProductObject = aSelectedProducts[i].getBindingContext().getObject();
                    oProductObject.UnitsInStock += 10;
                    this.getModel().update(sPath, oProductObject, {
                        success: this._handleReorderActionResult.bind(this, oProductObject.ProductID, true, i + 1, aSelectedProducts.length),
                        error: this._handleReorderActionResult.bind(this, oProductObject.ProductID, false, i + 1, aSelectedProducts.length)
                    });
                }
            } else {
                this._showErrorMessage(this.getModel("i18n").getResourceBundle().getText("TableSelectProduct"));
            }
        },

        /**
         * return the key for the item 
         *  @param {sap.ui.core.Item} oItem basic item in list
         * @return {String} key from the item
         */
        _getKeyFromItem: function(oItem) {
            return oItem.getKey();
        },

        /**
         * Event handler when category multi combo selection finishd
         * @param {sap.ui.base.Event} oEvent the multicombo selectionChange event
         */
        onCategorySelectionFinish: function(oEvent) {
            this._oAppState.selectedCategories = oEvent.getParameter("selectedItems").map(this._getKeyFromItem);
            this._applyFilters();
        },

        /**
         * Event handler when supplier multi combo selection finishd
         * @param {sap.ui.base.Event} oEvent the multicombo selectionChange event
         */
        onSupplierSelectionFinish: function(oEvent) {
            this._oAppState.selectedSuppliers = oEvent.getParameter("selectedItems").map(this._getKeyFromItem);
            this._applyFilters();
        },

        /**
         * if navigated back with appstate enabled then rehydrate the page using the
         * stored data
         * @param {Object} oAppData data persisted via iAppState
         * @param {Object} oURLParameters paramters passed in
         * @param {String} sNavType type of navigation
         */
        onNavigationDone: function(oAppData, oURLParameters, sNavType) {
            switch (sNavType) {
                case NavType.initial:
                    break;
                case NavType.iAppState:
                    this._oAppState = oAppData.customData;
                    // set the previously selected icon filter tab
                    this.byId("iconTabBar").setSelectedKey(this._oAppState.selectedTabFilter);

                    // apply previous filters to table
                    this._applyFilters();

                    // set the previous search state
                    this.byId("searchField").setValue(this._oAppState.searchText);

                    // set the previously selected multi combo tokens
                    this.byId("categories").setSelectedKeys(this._oAppState.selectedCategories);
                    this.byId("suppliers").setSelectedKeys(this._oAppState.selectedSuppliers);

                    // select previously selected rows
                    this.byId("table").setSelectedContextPaths(this._oAppState.selectedContextPaths);
                    break;
            }
        }
    });
});