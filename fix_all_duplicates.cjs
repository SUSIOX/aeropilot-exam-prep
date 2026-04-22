// Fix all critical duplicates in DynamoDB
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Seznam kritických duplicit s různými správnými odpověďmi
// Formát: { questionText, primaryId, primaryCorrect, duplicateId, duplicateCorrect }
const criticalDuplicates = [
    {
        questionText: "Který z následujících jevů NENÍ primárním nebezpečím bouřky pro letadlo?",
        primaryId: "ai_050.01.13.03_5wc2x",
        primaryCorrect: 0,
        duplicateId: "ai_050.01.13.03_22cim",
        duplicateCorrect: 3
    },
    {
        questionText: "Které tři podmínky jsou nezbytné pro vznik bouřky?",
        primaryId: "ai_050.01.13.01_zpur4",
        primaryCorrect: 2,
        duplicateId: "ai_050.01.13.01_roxyt",
        duplicateCorrect: 1
    },
    {
        questionText: "Deviace je způsobena.",
        primaryId: "medlanky_nav_25",
        primaryCorrect: 0,
        duplicateId: "klub_q53",
        duplicateCorrect: 2
    },
    {
        questionText: "Proč jsou v letadlech instalovány kyslíkové systémy?",
        primaryId: "ai_020.05.07.01_6viyg",
        primaryCorrect: 2,
        duplicateId: "ai_020.05.07.01_ntcsh",
        duplicateCorrect: 1
    },
    {
        questionText: "Co je znakem přístupu předvádění se?",
        primaryId: "subject2_q51",
        primaryCorrect: 1,
        duplicateId: "klub_q76",
        duplicateCorrect: 0
    },
    {
        questionText: "Za jakých okolností je pravděpodobnější přijmutí vyššího rizika?",
        primaryId: "subject2_q48",
        primaryCorrect: 1,
        duplicateId: "klub_q75",
        duplicateCorrect: 2
    },
    {
        questionText: "Jaký je hlavní rozdíl mezi pístovým a turbovrtulovým motorem?",
        primaryId: "ai_020.01.06.01_bf6ne",
        primaryCorrect: 2,
        duplicateId: "ai_020.01.06.01_rnrhz",
        duplicateCorrect: 1
    },
    {
        questionText: "Který z následujících je typ kyslíkového systému používaného v letadlech?",
        primaryId: "ai_020.05.07.02_auc1o",
        primaryCorrect: 0,
        duplicateId: "ai_020.05.07.02_1nzz1",
        duplicateCorrect: 2
    },
    {
        questionText: "Který ze smyslů je nejvíce ovlivněn výškovou nemocí?",
        primaryId: "subject2_q12",
        primaryCorrect: 2,
        duplicateId: "klub_q72",
        duplicateCorrect: 0
    },
    {
        questionText: "Při klouzavém letu je úhel náběhu:",
        primaryId: "klub_q222",
        primaryCorrect: 0,
        duplicateId: "aerodnamika_q80",
        duplicateCorrect: 3
    },
    {
        questionText: "Jaký je správný název systému, který, kromě jiného, řídí dýchání, trávení a tep srdce?",
        primaryId: "subject2_q23",
        primaryCorrect: 0,
        duplicateId: "klub_q213",
        duplicateCorrect: 1
    },
    {
        questionText: "Jaký je hlavní účel Flight Information Service (FIS)?",
        primaryId: "ai_090.02.01.02_ltmxp",
        primaryCorrect: 2,
        duplicateId: "ai_010.04.03.02_vm050",
        duplicateCorrect: 1
    },
    {
        questionText: "Jaké nebezpečné přístupy jsou často kombinovány?",
        primaryId: "subject2_q50",
        primaryCorrect: 3,
        duplicateId: "klub_q85",
        duplicateCorrect: 2
    },
    {
        questionText: "Za jakých podmínek vzniká geostrofický vítr?",
        primaryId: "ai_050.01.11.02_3qwpu",
        primaryCorrect: 0,
        duplicateId: "ai_050.01.11.02_agqit",
        duplicateCorrect: 1
    },
    {
        questionText: "Kritický úhel náběhu:",
        primaryId: "subject5_q70",
        primaryCorrect: 1,
        duplicateId: "subject5_q48",
        duplicateCorrect: 0
    },
    {
        questionText: "Která odpověď týkající se stresu je správná?",
        primaryId: "klub_q77",
        primaryCorrect: 3,
        duplicateId: "subject2_q58",
        duplicateCorrect: 2
    },
    {
        questionText: "Proč jsou pozorování počasí za letu důležitá pro bezpečnost letu?",
        primaryId: "ai_050.01.27.01_l9izm",
        primaryCorrect: 0,
        duplicateId: "ai_050.01.27.01_kb1px",
        duplicateCorrect: 1
    },
    {
        questionText: "Jaký je hlavní přínos výzkumu lidského faktoru pro letectví?",
        primaryId: "ai_040.01.01.58_0i8ro",
        primaryCorrect: 2,
        duplicateId: "ai_040.01.01.58_r3bsh",
        duplicateCorrect: 1
    },
    {
        questionText: "Odtržení proudu na profilu má za následek:",
        primaryId: "klub_q189",
        primaryCorrect: 1,
        duplicateId: "aerodnamika_q37",
        duplicateCorrect: 0
    },
    {
        questionText: "Vzroste-li během letu rychlost dvakrát (při stále stejném úhlu náběhu), tak:",
        primaryId: "aerodnamika_q31",
        primaryCorrect: 3,
        duplicateId: "aerodnamika_q30",
        duplicateCorrect: 2
    },
    {
        questionText: "Jaký optický klam může být způsoben přiblížením na dráhu se sklonem do kopce?",
        primaryId: "subject2_q33",
        primaryCorrect: 2,
        duplicateId: "klub_q74",
        duplicateCorrect: 3
    },
    {
        questionText: "Jaký je primární cíl nouzového klesání?",
        primaryId: "ai_030.08.02.01_h13i1",
        primaryCorrect: 1,
        duplicateId: "ai_030.08.02.01_qw49k",
        duplicateCorrect: 0
    },
    {
        questionText: "Co lze považovat za rizikový faktor pro cukrovku (diabetes)?",
        primaryId: "klub_q26",
        primaryCorrect: 1,
        duplicateId: "subject2_q39",
        duplicateCorrect: 3
    },
    {
        questionText: "Jaké geometrické charakteristiky profilu jsou označeny na obrázku?",
        primaryId: "aerodnamika_q19",
        primaryCorrect: 0,
        duplicateId: "aerodnamika_q18",
        duplicateCorrect: 1
    },
    {
        questionText: "Jak ovlivňuje námraza výkon letounu?",
        primaryId: "ai_080.05.02.03_pviqt",
        primaryCorrect: 1,
        duplicateId: "ai_080.05.02.03_165aa",
        duplicateCorrect: 2
    }
];

async function fixAllDuplicates() {
    console.log('🔧 Opravuji všechny kritické duplicity v DynamoDB...');
    console.log(`📋 Celkem k opravě: ${criticalDuplicates.length} duplicit\n`);
    
    const client = new DynamoDBClient({ region });
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < criticalDuplicates.length; i++) {
        const dup = criticalDuplicates[i];
        
        try {
            console.log(`--- ${i + 1}/${criticalDuplicates.length} ---`);
            console.log(`Otázka: ${dup.questionText}`);
            console.log(`Primární ID: ${dup.primaryId} (správná: ${dup.primaryCorrect})`);
            console.log(`Duplicitní ID: ${dup.duplicateId} (správná: ${dup.duplicateCorrect})`);
            
            // Opravit duplicitní otázku
            const updateCommand = new UpdateItemCommand({
                TableName: tableName,
                Key: {
                    questionId: { S: dup.duplicateId }
                },
                UpdateExpression: 'SET correct = :correct',
                ExpressionAttributeValues: {
                    ':correct': { N: dup.primaryCorrect.toString() }
                },
                ReturnValues: 'ALL_NEW'
            });
            
            const result = await client.send(updateCommand);
            
            console.log(`✅ Opraveno: ${dup.duplicateId} - správná odpověď změněna z ${dup.duplicateCorrect} na ${dup.primaryCorrect}`);
            successCount++;
            
        } catch (error) {
            console.error(`❌ Chyba při opravě ${dup.duplicateId}:`, error.message);
            errorCount++;
        }
        
        console.log(''); // Prázdný řádek pro lepší čitelnost
    }
    
    console.log(`\n🎯 VÝSLEDKY:`);
    console.log(`✅ Úspěšně opraveno: ${successCount}/${criticalDuplicates.length}`);
    console.log(`❌ Chyby: ${errorCount}/${criticalDuplicates.length}`);
    
    if (successCount === criticalDuplicates.length) {
        console.log(`\n🎉 Všechny kritické duplicity byly opraveny!`);
    } else {
        console.log(`\n⚠️  Některé duplicity se nepodařilo opravit - zkontroluj chyby výše.`);
    }
}

// Spusť opravu
fixAllDuplicates().catch(console.error);
