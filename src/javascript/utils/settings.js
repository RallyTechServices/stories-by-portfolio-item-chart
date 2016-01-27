Ext.define('Rally.technicalservices.Settings',{
    singleton: true,

    getFields: function(modelName){
        var labelWidth = 150;

        return [{
            xtype: 'rallyportfolioitemtypecombobox',
            name: 'portfolioModelName',
            fieldLabel: 'Portfolio Item Type',
            labelAlign: 'right',
            labelWidth: labelWidth,
            valueField: 'TypePath'
        },{
            xtype: 'tsfieldoptionscombobox',
            name: 'groupField',
            model: 'UserStory',
            noEntryText: '-- No Group Field --',
            labelWidth: labelWidth,
            labelAlign: 'right',
            fieldLabel: 'Group Field',
            allowNoEntry: true

        }];
    }
});
