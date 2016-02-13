Ext.define("stories-by-portfolio-item-chart", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            portfolioModelName: undefined,
            groupField: undefined,
            query: '(ScheduleState > "Completed")'
        }
    },

    integrationHeaders : {
        name : "stories-by-portfolio-item-chart"
    },

    lowestLevelPortfolioItemName: undefined,
    categorizedPortfolioItemName: undefined,
                        
    launch: function() {
        Rally.technicalservices.Settings.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){
                if (portfolioItemTypes.length > 2){
                    this.lowestLevelPortfolioItemName = portfolioItemTypes[0].typePath;
                    this.categorizedPortfolioItemName = portfolioItemTypes[2].typePath;
                    this._launchApp();
                } else {
                    this.add({
                        xtype: 'container',
                        html: 'Only 2 levels of portfolio items are defined in the this workspace.  This app requires 3 levels of portfolio item types.'
                    });
                }
            },
            failure: function(msg){
                this.add({
                    xtype: 'container',
                    html: 'Error loading portfolio item types:  ' + msg
                });
            },
            scope: this
        });
    },
    _launchApp: function(){
        this.logger.log('_launchApp');

        this._fetchPortfolioItemData().then({
            scope: this,
            success: this._addFilterComponents,
            failure: this._showError
        });
    },
    _showError: function(message){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({ message: message });
    },
    _fetchPortfolioItemData: function(){
        var deferred = Ext.create('Deft.Deferred'),
            storeConfigs = [{
                model: this.categorizedPortfolioItemName,
                fetch: ['ObjectID','FormattedID','Name','Children:summary[FormattedID]'],
                limit: 'Infinity'
            },{
                model: this.lowestLevelPortfolioItemName,
                fetch: ['ObjectID','FormattedID','Parent','UserStories:summary[FormattedID]'],
                limit: 'Infinity',
                filters: [{
                    property: "LeafStoryCount",
                    operator: ">",
                    value: 0
                },{
                    property: "Parent",
                    operator: "!=",
                    value: ""
                }]
            }];

        this.logger.log('storeConfigs', storeConfigs);

        var promises = _.map(storeConfigs, function(storeConfig){ return this._fetchWsapiData(storeConfig); }, this);

            Deft.Promise.all(promises).then({
                success: function(results){
                      this.portfolioItemHash = results[0].reduce(function(hash, record){
                            hash[record.get('FormattedID')] = {Name: record.get('Name'), Children: record.get('Summary') && record.get('Summary').Children && _.keys(record.get('Summary').Children.FormattedID)};
                            return hash;
                      }, {});

                    var hash = results[0].reduce(function ( hash, record ) {
                          var children = record.get('Summary') && record.get('Summary').Children && _.keys(record.get('Summary').Children.FormattedID);
                          _.each(children, function(c){
                              hash[c] = record.get('FormattedID');
                          });
                          return hash;
                        }, {});

                    var ancestorHash = {};
                    _.each(results[1], function(f){
                        var parent = f.get('Parent') && f.get('Parent').FormattedID;
                        ancestorHash[f.get('FormattedID')] = hash[parent];
                    });
                    this.ancestorHash = ancestorHash;
                    deferred.resolve();
                },
                failure: function(message){
                    deferred.reject(message);
                },
                scope: this
            });
        return deferred;
    },
    _addFilterComponents: function(ancestorHash){
        this.logger.log('_addFilterComponents', ancestorHash);
        this.removeAll();

        var endDate = new Date(),
            startDate = Rally.util.DateTime.add(endDate, 'month',-1);

        var bus = _.map(this.portfolioItemHash, function(obj, key){ return {name: obj.Name, value: key }});

        this.add({
            xtype: 'container',
            layout: 'hbox',
            items: [{
                xtype: 'rallydatefield',
                fieldLabel: 'Start Date',
                itemId: 'dt-start',
                labelAlign: 'right',
                value: startDate,
                listeners: {
                    change: this._updateData,
                    scope: this
                }
            },{
                xtype: 'rallydatefield',
                fieldLabel: 'End Date',
                itemId: 'dt-end',
                labelAlign: 'right',
                value: endDate,
                listeners: {
                    change: this._updateData,
                    scope: this
                }
            },{
                xtype: 'rallycombobox',
                fieldLabel: 'BU/CRG',
                labelAlign: 'right',
                itemId: 'cb-bu',
                store: Ext.create('Rally.data.custom.Store',{
                    fields: ['name','value'],
                    data: bus
                }),
                displayField: 'name',
                valueField: 'value',
                allowClear: true,
                clearText: '-- All BU/CRG --',
                multiSelect: true,
                width: 300,
                listeners: {
                    change: this._updateBUFilter,
                    scope: this
                }
            },{
                xtype: 'rallycombobox',
                fieldLabel: 'View',
                itemId: 'cb-view',
                labelAlign: 'right',
                store: Ext.create('Rally.data.custom.Store',{
                    fields: ['name','value'],
                    data: [{ name: 'Story Points', value: 'points' },{ name:'Story Count', value: 'count'}]
                }),
                displayField: 'name',
                valueField: 'value',
                allowNoEntry: false,
                noEntryText: '-- All BU/CRG --',
                width: 250,
                    listeners: {
                        change: this._buildChart,
                        scope: this
                    }
            }]
        });
        this._updateData();
    },
    _updateBUFilter: function(cb, newValue, oldValue){
        newValue = newValue || [];
        oldValue = oldValue || [];
        this.logger.log('_updateBUFilter', newValue, oldValue);
        if (oldValue[0] === "" && Ext.Array.contains(newValue, "")){
            newValue = _.filter(newValue, function(item){ return item !== ""; });
            this.logger.log('_updateBUFilter', newValue, oldValue);
            cb.setValue(newValue);
        }

        if (Ext.Array.contains(newValue, "") && !Ext.Array.contains(oldValue, "")){
            cb.setValue([""]);
        }
        this._buildChart();
    },
    _getStartDate: function(){
        return this.down('#dt-start') && this.down('#dt-start').getValue() || Rally.util.DateTime.add(new Date(), 'month',-1);
    },
    _getEndDate: function(){
        return this.down('#dt-end') && this.down('#dt-end').getValue() || new Date();
    },
    _fetchWsapiData: function(config){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback: function(records, operation){
                this.logger.log('_fetchWsapiData', records, operation);
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject("Error fetching wsapi data: " + operation.error.errors.join(","));
                }
            },
            scope: this
        });
        return deferred;
    },
    _getGroupField: function(){
        this.logger.log('_getGroupField', this.getSetting('groupField'));

        if (Ext.isArray(this.getSetting('groupField'))){
            this.logger.log('_getGroupField returning array');
            return this.getSetting('groupField');
        }

        if (this.getSetting('groupField')){
            this.logger.log('_getGroupField returning split string as array');
            return this.getSetting('groupField').split(',');
        }
        this.logger.log('_getGroupField returning null');
        return null;
    },
    _updateData: function(){
        this.logger.log('_updateData', this.ancestorHash, this.portfolioItemHash, this._getStartDate(), this._getEndDate());

        if (this.down('rallychart')){
            this.down('rallychart').destroy();
        }

        var featureName = this._getFeatureName(),
            filters = Ext.create('Rally.data.wsapi.Filter', {
                property: 'DirectChildrenCount',
                value: 0
            });
            filters = filters.and({
                property: 'AcceptedDate',
                operator: '>=',
                value: Rally.util.DateTime.toIsoString(this._getStartDate())
            });

            filters = filters.and({
                property: 'AcceptedDate',
                operator: '<=',
                value: Rally.util.DateTime.toIsoString(this._getEndDate())
            });

        var parentFilters = [{
            property: 'PortfolioItem',
            operator: '!=',
            value: "null"
        },{
            property: featureName,
            operator: '!=',
            value: "null"
        }];
        parentFilters = Rally.data.wsapi.Filter.or(parentFilters);

        filters = filters.and(parentFilters);
        this.logger.log('filters', filters.toString());

        var fetch = ['ObjectID','FormattedID','PortfolioItem',featureName,'PlanEstimate'];
        if (this._getGroupField()){
            fetch = fetch.concat(this._getGroupField());
        }

        var storeConfig = {
            model: 'HierarchicalRequirement',
            fetch: fetch,
            filters: filters,
            limit: 'Infinity'
        };

        this.setLoading(true);
        this._fetchWsapiData(storeConfig).then({
            success: this._buildChart,
            failure: this._showError,
            scope: this
        });


    },
    _buildChart: function(records){
        this.setLoading(false);
        this.logger.log('_buildChart', records && records.length);

        if (records && records.length > 0){
            this.records = records;
        }

        if (!this.records){
            return;
        }

        if (this.down('rallychart')){
            this.down('rallychart').destroy();
        }

        var chartData = this._getChartData(this.records);

        this.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: chartData,
            chartConfig: this._getChartConfig(this.records, chartData.categories)
        });

    },
    _getFeatureName: function(){
        return "ProjectorFeature";
    },
    _getPortfolioItemKeysToDisplay: function(){
        var displayKeys = [];

        if (this.down('#cb-bu') && this.down('#cb-bu').getValue() &&
            this.down('#cb-bu').getValue().length > 0 ){
            displayKeys = _.filter(this.down('#cb-bu').getValue(), function(item){ return item!== null && item !== ""; });
        }

        if (displayKeys.length === 0){
            displayKeys = _.keys(this.portfolioItemHash);
        }
        return displayKeys;

    },
    _getUnitsName: function(){
        var view = this.down('#cb-view'),
            unitName = view && view.getRecord() && view.getRecord().get('name') || "Story Count";
        return unitName;
    },
    _getShowPoints: function(){
        var view = this.down('#cb-view'),
            showPoints = view && view.getValue() === 'points';
        return showPoints;
    },
    _getChartData: function(records){
        var dataHash = {},
            groupFields = this._getGroupField(),
            groupFieldValues = [],
            featureName = this._getFeatureName(),
            ancestorHash = this.ancestorHash;


        var showPoints = this._getShowPoints();

        _.each(records, function(rec){
            var parent = rec.get('PortfolioItem') && rec.get('PortfolioItem').FormattedID || rec.get(featureName) && rec.get(featureName).FormattedID || null;

            if (parent && ancestorHash[parent]){
                var ancestor = ancestorHash[parent];

                if (!dataHash[ancestor]){
                    //dataHash[ancestor] = { total: { count: 0, points: 0 }};
                    dataHash[ancestor] = {total: 0};
                }

                if (showPoints){
                    dataHash[ancestor].total += rec.get('PlanEstimate') || 0;
                    //dataHash[ancestor].total.points += rec.get('PlanEstimate') || 0;
                } else {
                    dataHash[ancestor].total++;
                }

                if (groupFields && groupFields.length > 0){
                    var val = "-- No Entry --";
                    Ext.Array.each(groupFields, function(groupField){
                        val = rec.get(groupField) || val;
                        if (Ext.isObject(val)){
                            val = val._refObjectName || val.Name;
                        }
                    });

                    if (!Ext.Array.contains(groupFieldValues, val)){
                        groupFieldValues.push(val);
                    }

                    if (!dataHash[ancestor][val]){
                        dataHash[ancestor][val] = 0;
                    }
                    if (showPoints){
                        dataHash[ancestor][val] += (rec.get('PlanEstimate') || 0);
                    } else {
                        dataHash[ancestor][val]++;
                    }
                }
            }
        }, this);


        //var categories = _.map(dataHash, function(obj,key){ return this.portfolioItemHash[key] && this.portfolioItemHash[key].Name || "Unknown BU"; }, this),
        //    series = [];


        var busToDisplay = this._getPortfolioItemKeysToDisplay();

        var categories = _.map(busToDisplay, function(key){ return this.portfolioItemHash[key].Name; }, this),
            series = [];

        if (groupFieldValues.length === 0){ groupFieldValues.push('total'); }
        this.logger.log('_getChartData', dataHash, groupFieldValues);

        _.each(groupFieldValues, function(group){
            //var seriesObjCount = {name: group + " Story Count", data: [], stack: 'count'},
            //    seriesObjPoints = {name: group + " Story Points", data: [], stack: 'points'};
            var seriesObj = {name: group , data: []};

                _.each(busToDisplay, function(buKey){
                if (dataHash[buKey]){
                    seriesObj.data.push(dataHash[buKey][group] || 0)
                    //seriesObjPoints.data.push(dataHash[key][group] && dataHash[key][group].points || 0);
                    //seriesObjCount.data.push(dataHash[key][group] && dataHash[key][group].count || 0);
                } else {
                    //seriesObjPoints.data.push(0);
                    //seriesObjCount.data.push(0);
                    seriesObj.data.push(0);
                }
            }, this);

            series.push(seriesObj);
            //series.push(seriesObjPoints);
            //series.push(seriesObjCount);
        }, this);

        this.logger.log('_getChartData', series, categories);

        return {
            categories: categories,
            series: series
        };
    },
    _getGroupFieldsDisplayName: function(model, groupFields){
        this.logger.log('_getGropuFieldsDisplayName', groupFields);
        if (!groupFields || groupFields.length === 0 || groupFields[0] === null){
            return '';
        }

        if (groupFields && groupFields.length === 0){
            return model.getField(groupFields[0]).displayName;
        }

        return _.map(groupFields, function(groupField){ console.log('groupField', groupField); return model.getField(groupField).displayName;}).join(', ');
    },
    _getChartConfig: function(records, categories){
        var title = "Stories by Business Unit",
            groupFields = this._getGroupField();

        if (groupFields && groupFields.length > 0 && records.length > 0){
            title = "Stories by " + this._getGroupFieldsDisplayName(records[0], groupFields) + ' by Business Unit'
        }

        var rotation = 0;
        if (categories && categories.length > 6){
            rotation = -60;
        }


        var units = this._getUnitsName();

        return {
            chart: {
                type: 'column'
            },
            title: {
                text: title
            },
            subtitle: {
                text: null
            },
            xAxis: {
                categories: categories,
                labels: {
                    rotation: rotation
                }
            },
            yAxis: {
                min: 0,
                title: {
                    text: units
                }
            },
            legend: {
                enabled:  (groupFields !== null && groupFields.length > 0),
                align: 'right',
                layout: 'vertical',
                verticalAlign: 'top'
            },
            tooltip: {
                headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
                pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
                '<td style="padding:0"><b>{point.y} Stories</b></td></tr>',
                footerFormat: '</table>',
                shared: false,
                useHTML: true
            },
            plotOptions: {
                column: {
                    pointPadding: 0.2,
                    borderWidth: 0,
                    stacking: 'normal'
                }
            }
        };
    },

    getSettingsFields: function(){
        return Rally.technicalservices.Settings.getFields();
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        this._launchApp(settings);
    }
});
